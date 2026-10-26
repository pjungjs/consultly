import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DateTime } from 'luxon';
import { DEMO_CONSULTANT, demoAccounts, demoIdFor, demoIdOf } from './demo.js';
import { DemoService, sampleSessions } from './demo.service.js';

function setup() {
  const prisma = {
    client: { upsert: vi.fn(), deleteMany: vi.fn() },
    consultant: {
      findUnique: vi.fn().mockResolvedValue(null), // no pair yet
      findMany: vi.fn().mockResolvedValue([]), // no stale pairs
      create: vi
        .fn()
        .mockResolvedValue({ id: 'copy1', rateCents: 20000, slotMinutes: 60 }),
      delete: vi.fn(),
    },
    order: {
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue([{ id: 'o1' }]),
      deleteMany: vi.fn(),
    },
    brief: { findUnique: vi.fn().mockResolvedValue(null) },
    session: { findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn() },
  };
  const auth = { startSession: vi.fn().mockResolvedValue('sid') };
  return {
    service: new DemoService(prisma as never, auth as never),
    prisma,
    auth,
  };
}

beforeEach(() => vi.stubEnv('DEMO_LOGIN', 'true'));
afterEach(() => vi.unstubAllEnvs());

describe('demo accounts', () => {
  it('derive a private pair of made-up addresses from the cookie secret', () => {
    const id = demoIdFor('a'.repeat(43));
    expect(id).toMatch(/^[a-f0-9]{12}$/);
    const { client, consultant } = demoAccounts(id);
    expect(demoIdOf(client)).toBe(id);
    expect(demoIdOf(consultant)).toBe(id);
    expect(demoIdOf('jason@consultly.test')).toBeNull();
  });
});

describe('DemoService.start', () => {
  it('is off unless DEMO_LOGIN=true', async () => {
    vi.stubEnv('DEMO_LOGIN', '');
    await expect(setup().service.start('client')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("creates the visitor's pair: Jason in their own time zone, with sample sessions", async () => {
    const { service, prisma, auth } = setup();
    const { demoToken, role } = await service.start(
      'consultant',
      undefined,
      'Asia/Seoul',
    );
    const { client, consultant } = demoAccounts(demoIdFor(demoToken));
    expect(prisma.consultant.create.mock.calls[0][0].data).toMatchObject({
      name: DEMO_CONSULTANT.name,
      email: consultant,
      timezone: 'Asia/Seoul',
      demoOwner: demoIdFor(demoToken),
    });
    // Each side gets its own editable name.
    expect(prisma.client.upsert.mock.calls.map((c) => c[0].create)).toEqual([
      { email: client, name: 'Peter Parkinson', timezone: 'Asia/Seoul' },
      { email: consultant, name: DEMO_CONSULTANT.name, timezone: 'Asia/Seoul' },
    ]);
    expect(prisma.order.create).toHaveBeenCalledTimes(4);
    expect(prisma.order.create.mock.calls[0][0].data).toMatchObject({
      clientEmail: client,
      clientName: 'Peter Parkinson',
    });
    expect(role).toBe('consultant');
    expect(auth.startSession).toHaveBeenCalledWith(consultant);
  });

  it('returns a visitor to the same pair, and makes no second copy', async () => {
    const { service, prisma } = setup();
    prisma.consultant.findUnique.mockResolvedValue({ id: 'copy1' });
    const token = 'b'.repeat(43);
    const { demoToken } = await service.start('client', token);
    expect(demoToken).toBe(token);
    expect(prisma.consultant.create).not.toHaveBeenCalled();
  });

  it('ignores a malformed cookie and an unknown time zone', async () => {
    const { service, prisma } = setup();
    const { demoToken } = await service.start(
      'client',
      'not-a-token',
      'Mars/Base',
    );
    expect(demoToken).not.toBe('not-a-token');
    expect(prisma.consultant.create.mock.calls[0][0].data.timezone).toBe(
      DEMO_CONSULTANT.timezone,
    );
  });

  it('removes old pairs nobody is signed in to, but keeps ones in use', async () => {
    const { service, prisma } = setup();
    prisma.consultant.findMany.mockResolvedValue([
      { demoOwner: 'aaaaaaaaaaaa' },
      { demoOwner: 'bbbbbbbbbbbb' },
    ]);
    prisma.session.findMany.mockResolvedValue([
      { email: demoAccounts('bbbbbbbbbbbb').client },
    ]);
    await service.start('client');
    const deleted = prisma.session.deleteMany.mock.calls.map(
      (c) => c[0].where.email.in,
    );
    expect(deleted).toEqual([Object.values(demoAccounts('aaaaaaaaaaaa'))]);
  });
});

describe('DemoService.reset', () => {
  it("clears the visitor's bookings and copy, recreates the defaults, and keeps them signed in", async () => {
    const { service, prisma } = setup();
    prisma.consultant.findUnique
      .mockResolvedValueOnce({ id: 'copy1' })
      .mockResolvedValue(null);
    await service.reset('demo-client-0123456789ab@consultly.test', 'America/New_York');
    expect(prisma.order.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['o1'] } },
    });
    expect(prisma.consultant.delete).toHaveBeenCalledWith({
      where: { id: 'copy1' },
    });
    expect(prisma.consultant.create).toHaveBeenCalled();
    expect(prisma.order.create).toHaveBeenCalledTimes(4);
    expect(prisma.session.deleteMany).not.toHaveBeenCalled();
  });

  it('refuses real accounts', async () => {
    const { service, prisma } = setup();
    await expect(service.reset('dana@example.com')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.order.deleteMany).not.toHaveBeenCalled();
  });
});

describe('sample sessions', () => {
  it("are two upcoming (cancellable, over 24 hours away), one cancelled and one past, on weekdays inside Jason's hours", () => {
    const zone = 'America/New_York';
    const now = DateTime.now();
    const sessions = sampleSessions(zone);
    const upcoming = sessions.filter((s) => !s.cancelled && s.startsAt > now);
    expect(upcoming).toHaveLength(2);
    expect(
      upcoming.every((s) => s.startsAt.diff(now, 'hours').hours > 24),
    ).toBe(true);
    expect(sessions.filter((s) => s.cancelled)).toHaveLength(1);
    expect(sessions.filter((s) => s.startsAt < now)).toHaveLength(1);
    for (const { startsAt } of sessions) {
      expect(startsAt.weekday).toBeLessThanOrEqual(5);
      expect(startsAt.hour).toBeGreaterThanOrEqual(10);
      expect(startsAt.hour).toBeLessThan(16);
    }
  });
});
