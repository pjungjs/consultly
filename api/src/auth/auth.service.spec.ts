import {
  BadGatewayException,
  ForbiddenException,
  HttpException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { hashToken, newToken } from './tokens.js';

function setup() {
  const prisma = {
    loginToken: {
      count: vi.fn().mockResolvedValue(0), // links sent to this address in the last 15 minutes
      create: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: vi
        .fn()
        .mockResolvedValue({ email: 'dana@example.com' }),
    },
    session: { create: vi.fn(), findUnique: vi.fn(), deleteMany: vi.fn() },
    consultant: { findUnique: vi.fn() },
    client: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockImplementation(({ create }) => create),
      update: vi.fn(),
    },
    order: { findFirst: vi.fn().mockResolvedValue(null) },
  };
  const email = { send: vi.fn().mockResolvedValue(undefined) };
  return {
    service: new AuthService(prisma as never, email as never),
    prisma,
    email,
  };
}

/** Pulls the raw token back out of the link inside the email text. */
const tokenFromEmail = (email: { send: ReturnType<typeof vi.fn> }) =>
  /token=([\w-]+)/.exec(email.send.mock.calls[0][2])![1];

describe('tokens', () => {
  it('makes unguessable, URL-safe tokens', () => {
    const a = newToken();
    expect(a).toMatch(/^[\w-]{43}$/);
    expect(newToken()).not.toBe(a);
  });

  it('hashes the same token the same way, never to itself', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
    expect(hashToken('abc')).not.toContain('abc');
  });
});

describe('AuthService.requestLink', () => {
  const env = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = env;
  });

  it('stores only the hash of the emailed token, for a normalised email', async () => {
    const { service, prisma, email } = setup();
    await service.requestLink('  Dana@Example.com ');
    const token = tokenFromEmail(email);
    const stored = prisma.loginToken.create.mock.calls[0][0].data;
    expect(stored.email).toBe('dana@example.com');
    expect(stored.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(stored)).not.toContain(token);
    expect(stored.expiresAt.getTime() - Date.now()).toBeCloseTo(
      15 * 60_000,
      -4,
    ); // ~15 minutes
  });

  it('returns the link with the error outside production', async () => {
    process.env.NODE_ENV = 'development';
    const { service, email } = setup();
    email.send.mockRejectedValue(new Error('testing emails only to the owner'));
    const err = await service
      .requestLink('dana@example.com')
      .catch((e: BadGatewayException) => e);
    expect(err).toBeInstanceOf(BadGatewayException);
    expect((err as BadGatewayException).getResponse()).toMatchObject({
      devLink: expect.stringContaining('/my-bookings/verify?token='),
    });
  });

  it('never returns the link in production', async () => {
    process.env.NODE_ENV = 'production';
    const { service, email } = setup();
    email.send.mockRejectedValue(new Error('down'));
    const err = (await service
      .requestLink('dana@example.com')
      .catch((e: BadGatewayException) => e)) as BadGatewayException;
    expect(err).toBeInstanceOf(BadGatewayException);
    expect(JSON.stringify(err.getResponse())).not.toMatch(
      /devLink|devReason|token=/,
    );
  });
});

describe('AuthService.verify', () => {
  it('spends the link atomically and starts a 7-day session', async () => {
    const { service, prisma } = setup();
    const sessionId = await service.verify('raw-link-token');
    const where = prisma.loginToken.updateMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      tokenHash: hashToken('raw-link-token'),
      usedAt: null,
    });
    expect(where.expiresAt.gt).toBeInstanceOf(Date);
    const session = prisma.session.create.mock.calls[0][0].data;
    expect(session).toMatchObject({
      email: 'dana@example.com',
      tokenHash: hashToken(sessionId),
    });
    expect(session.expiresAt.getTime() - Date.now()).toBeCloseTo(
      7 * 86_400_000,
      -5,
    );
  });

  it('rejects a used or expired link', async () => {
    const { service, prisma } = setup();
    prisma.loginToken.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.verify('used')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.session.create).not.toHaveBeenCalled();
  });
});

describe('AuthService sessions', () => {
  it('401s without a cookie or with an expired session', async () => {
    const { service, prisma } = setup();
    await expect(service.emailFor(undefined)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    prisma.session.findUnique.mockResolvedValue({
      email: 'dana@example.com',
      expiresAt: new Date(Date.now() - 1000),
    });
    await expect(service.emailFor('sid')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('looks the session up by hash, not by the raw cookie', async () => {
    const { service, prisma } = setup();
    prisma.session.findUnique.mockResolvedValue({
      email: 'dana@example.com',
      expiresAt: new Date(Date.now() + 60_000),
    });
    await expect(service.emailFor('sid')).resolves.toBe('dana@example.com');
    expect(prisma.session.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: hashToken('sid') },
    });
  });

  it('403s when the email has no consultant profile', async () => {
    const { service, prisma } = setup();
    prisma.session.findUnique.mockResolvedValue({
      email: 'dana@example.com',
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.consultant.findUnique.mockResolvedValue(null);
    await expect(service.consultantFor('sid')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

describe('AuthService.ensureClient', () => {
  it('returns the existing client record untouched', async () => {
    const { service, prisma } = setup();
    prisma.client.findUnique.mockResolvedValue({
      email: 'dana@example.com',
      name: 'Dana K',
    });
    await expect(
      service.ensureClient('dana@example.com'),
    ).resolves.toMatchObject({ name: 'Dana K' });
    expect(prisma.client.upsert).not.toHaveBeenCalled();
  });

  it('creates one from the latest booking, race-safely', async () => {
    const { service, prisma } = setup();
    prisma.order.findFirst.mockResolvedValue({
      clientName: 'Dana',
      clientTimezone: 'Asia/Seoul',
    });
    await expect(
      service.ensureClient('dana@example.com'),
    ).resolves.toMatchObject({ name: 'Dana', timezone: 'Asia/Seoul' });
    expect(prisma.client.upsert.mock.calls[0][0].update).toEqual({}); // a concurrent insert wins; nothing is overwritten
  });
});

describe('sign-in email limit', () => {
  it('sends at most 3 links per address per 15 minutes, without contacting the email service', async () => {
    const { service, prisma, email } = setup();
    prisma.loginToken.count.mockResolvedValue(3);
    const err = (await service
      .requestLink('Dana@example.com')
      .catch((e: HttpException) => e)) as HttpException;
    expect(err.getStatus()).toBe(429);
    expect(prisma.loginToken.count.mock.calls[0][0].where.email).toBe(
      'dana@example.com',
    );
    expect(email.send).not.toHaveBeenCalled();
  });
});
