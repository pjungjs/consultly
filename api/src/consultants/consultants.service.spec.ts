import { ConsultantsService } from './consultants.service.js';

function setup(consultant: Record<string, unknown>) {
  const prisma = {
    consultant: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(consultant),
    },
    booking: { findMany: vi.fn().mockResolvedValue([]) },
    timeOff: { findMany: vi.fn().mockResolvedValue([]) },
  };
  return { service: new ConsultantsService(prisma as never), prisma };
}

const everyDay = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
  weekday,
  startTime: '09:00',
  endTime: '17:00',
}));
const consultant = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  timezone: 'UTC',
  slotMinutes: 60,
  paused: false,
  availability: everyDay,
  ...over,
});

describe('ConsultantsService', () => {
  it('lists only profiles that are taking bookings, never demo copies, and never emails', async () => {
    const { service, prisma } = setup(consultant());
    await service.list();
    const query = prisma.consultant.findMany.mock.calls[0][0];
    expect(query.where).toEqual({
      paused: false,
      demoOwner: null,
      availability: { some: {} },
    });
    expect(query.select.email).toBeUndefined();
  });

  it('shows one profile without its email, saying whether it is a demo copy', async () => {
    const { service, prisma } = setup(consultant({ demoOwner: 'abc' }));
    const profile = await service.profile('c1');
    expect(
      prisma.consultant.findUnique.mock.calls[0][0].select.email,
    ).toBeUndefined();
    expect(profile).toMatchObject({ id: 'c1', demo: true });
    expect(profile).not.toHaveProperty('demoOwner');
  });

  it('offers times up to 60 days ahead', async () => {
    const { service } = setup(consultant());
    const { slots } = await service.slots('c1');
    const lastDays =
      (new Date(slots.at(-1)!).getTime() - Date.now()) / 86_400_000;
    expect(lastDays).toBeGreaterThan(58);
    expect(lastDays).toBeLessThan(61);
  });

  it('offers no times while paused, so nothing new can be booked', async () => {
    const { service } = setup(consultant({ paused: true }));
    expect((await service.slots('c1')).slots).toEqual([]);
  });
});
