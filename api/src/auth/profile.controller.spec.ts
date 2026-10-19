import { ConflictException, ForbiddenException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { listingStatus } from './listing-status.js';
import {
  ConsultantProfileDto,
  ProfileController,
} from './profile.controller.js';

const req = { cookies: { consultly_session: 'sid' } } as never;
const row = (over: Record<string, unknown> = {}) => ({
  id: 'c9',
  name: 'Mina Park',
  headline: 'Brand strategy',
  bio: 'Ten years in brand.',
  category: 'Strategy',
  rateCents: 12000,
  timezone: 'Europe/Paris',
  paused: false,
  _count: { availability: 0 },
  ...over,
});
const form = {
  name: '  Mina Park ',
  headline: 'Brand strategy',
  bio: 'Ten years in brand.',
  category: 'Strategy',
  rateCents: 12000,
  timezone: 'Europe/Paris',
  slotMinutes: 60,
};

function setup() {
  const prisma = {
    consultant: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(row()),
      update: vi.fn(),
    },
    client: {
      update: vi
        .fn()
        .mockResolvedValue({ name: 'Mina', timezone: 'Asia/Seoul' }),
    },
  };
  const auth = {
    emailFor: vi.fn().mockResolvedValue('mina@example.com'),
    ensureClient: vi.fn().mockResolvedValue({ name: 'Mina', timezone: null }),
    consultantFor: vi.fn().mockResolvedValue({ id: 'c9' }),
  };
  return {
    controller: new ProfileController(auth as never, prisma as never),
    prisma,
    auth,
  };
}

describe('listingStatus', () => {
  it('is live only when not paused and weekly hours exist', () => {
    expect(listingStatus({ paused: false, _count: { availability: 3 } })).toBe(
      'live',
    );
    expect(listingStatus({ paused: false, _count: { availability: 0 } })).toBe(
      'needs-hours',
    );
    expect(listingStatus({ paused: true, _count: { availability: 3 } })).toBe(
      'paused',
    );
  });
});

describe('ProfileController', () => {
  it('saves the client name trimmed, creating the client record first if needed', async () => {
    const { controller, prisma, auth } = setup();
    await controller.saveClient(req, {
      name: '  Mina ',
      timezone: 'Asia/Seoul',
    });
    expect(auth.ensureClient).toHaveBeenCalledWith('mina@example.com');
    expect(prisma.client.update).toHaveBeenCalledWith({
      where: { email: 'mina@example.com' },
      data: { name: 'Mina', timezone: 'Asia/Seoul' },
    });
  });

  it('lets a client become a consultant, hidden until weekly hours are set', async () => {
    const { controller, prisma } = setup();
    const created = await controller.becomeConsultant(req, form);
    expect(prisma.consultant.create.mock.calls[0][0].data).toMatchObject({
      email: 'mina@example.com',
      name: 'Mina Park',
    });
    expect(created).toMatchObject({ id: 'c9', status: 'needs-hours' });
    expect(created).not.toHaveProperty('_count');
  });

  it('refuses a second consultant profile for the same email', async () => {
    const { controller, prisma } = setup();
    prisma.consultant.findUnique.mockResolvedValue(row());
    await expect(controller.becomeConsultant(req, form)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.consultant.create).not.toHaveBeenCalled();
  });

  it('pauses and resumes the profile', async () => {
    const { controller, prisma } = setup();
    prisma.consultant.update.mockResolvedValue(
      row({ paused: true, _count: { availability: 2 } }),
    );
    await expect(
      controller.setStatus(req, { paused: true }),
    ).resolves.toMatchObject({ status: 'paused' });
    expect(prisma.consultant.update.mock.calls[0][0]).toMatchObject({
      where: { id: 'c9' },
      data: { paused: true },
    });
  });
});

describe('ConsultantProfileDto', () => {
  const errors = async (over: Record<string, unknown>) =>
    (
      await validate(
        plainToInstance(ConsultantProfileDto, { ...form, ...over }),
      )
    ).map((e) => e.property);

  it('accepts a complete profile', async () => {
    expect(await errors({})).toEqual([]);
  });

  it('rejects unknown categories, out-of-range prices and fake time zones', async () => {
    expect(
      await errors({
        category: 'Cooking',
        rateCents: 500,
        timezone: 'Mars/Base',
      }),
    ).toEqual(['category', 'rateCents', 'timezone']);
    expect(await errors({ rateCents: 100_001 })).toEqual(['rateCents']);
  });
});

describe('session length', () => {
  it('accepts 30 or 60 minutes only', async () => {
    const errors = async (slotMinutes: number) =>
      (
        await validate(
          plainToInstance(ConsultantProfileDto, { ...form, slotMinutes }),
        )
      ).map((e) => e.property);
    expect(await errors(30)).toEqual([]);
    expect(await errors(45)).toEqual(['slotMinutes']);
  });
});

describe('demo accounts', () => {
  it('edit their own private profiles, but cannot open a public consultant profile', async () => {
    const { controller, auth, prisma } = setup();
    auth.emailFor.mockResolvedValue('demo-0123456789ab@consultly.test');
    auth.consultantFor.mockResolvedValue({ id: 'c1' });
    prisma.consultant.update.mockResolvedValue(row());
    await expect(
      controller.saveClient(req, { name: 'My name', timezone: 'UTC' }),
    ).resolves.toBeDefined();
    await expect(controller.saveConsultant(req, form)).resolves.toBeDefined();
    await expect(controller.becomeConsultant(req, form)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.consultant.create).not.toHaveBeenCalled();
  });
});
