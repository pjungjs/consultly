import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AvailabilityController } from './availability.controller.js';

const jason = { id: 'c1', timezone: 'Europe/London' };
const req = { cookies: { consultly_session: 'sid' } } as never;

function setup({
  weekly = [] as unknown[],
  timeOff = [] as unknown[],
  booked = [] as unknown[],
} = {}) {
  const prisma = {
    $transaction: vi.fn(),
    availability: {
      findMany: vi.fn().mockResolvedValue(weekly),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    timeOff: {
      findMany: vi.fn().mockResolvedValue(timeOff),
      create: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    booking: { findMany: vi.fn().mockResolvedValue(booked) },
  };
  const auth = { consultantFor: vi.fn().mockResolvedValue(jason) };
  return {
    controller: new AvailabilityController(auth as never, prisma as never),
    prisma,
  };
}

describe('AvailabilityController', () => {
  it('replaces the whole week in one transaction', async () => {
    const { controller, prisma } = setup();
    await controller.saveHours(req, {
      weekly: [{ weekday: 7, startTime: '10:00', endTime: '14:00' }],
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.availability.createMany).toHaveBeenCalledWith({
      data: [
        {
          weekday: 7,
          startTime: '10:00',
          endTime: '14:00',
          consultantId: 'c1',
        },
      ],
    });
  });

  it('rejects an end time before the start, and two ranges on one day', async () => {
    const { controller, prisma } = setup();
    await expect(
      controller.saveHours(req, {
        weekly: [{ weekday: 1, startTime: '17:00', endTime: '09:00' }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.saveHours(req, {
        weekly: [
          { weekday: 1, startTime: '09:00', endTime: '12:00' },
          { weekday: 1, startTime: '13:00', endTime: '17:00' },
        ],
      }),
    ).rejects.toThrow('One range per weekday');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("stores time off as whole days in the consultant's own zone", async () => {
    const { controller, prisma } = setup();
    // London is on BST until 25 Oct 2026, so local midnight is 23:00 UTC the day before.
    await controller.addTimeOff(req, {
      from: '2026-10-22',
      to: '2026-10-23',
      note: '  Holiday ',
    });
    const data = prisma.timeOff.create.mock.calls[0][0].data;
    expect(data.startsAt.toISOString()).toBe('2026-10-21T23:00:00.000Z');
    expect(data.endsAt.toISOString()).toBe('2026-10-23T23:00:00.000Z');
    expect(data.note).toBe('Holiday');
  });

  it('rejects time off that ends before it starts', async () => {
    const { controller } = setup();
    await expect(
      controller.addTimeOff(req, { from: '2026-10-23', to: '2026-10-22' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("can only remove the consultant's own time off", async () => {
    const { controller, prisma } = setup();
    prisma.timeOff.deleteMany.mockResolvedValue({ count: 0 });
    await expect(
      controller.removeTimeOff(req, 'not-mine'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.timeOff.deleteMany).toHaveBeenCalledWith({
      where: { id: 'not-mine', consultantId: 'c1' },
    });
  });

  it('flags booked sessions that fall outside the hours or during time off', async () => {
    const session = (id: string, iso: string) => ({
      id,
      startsAt: new Date(iso),
      endsAt: new Date(new Date(iso).getTime() + 3_600_000),
      order: { clientName: 'Dana' },
    });
    const { controller } = setup({
      weekly: [{ weekday: 1, startTime: '10:00', endTime: '16:00' }], // Mondays, London time
      timeOff: [
        {
          id: 't1',
          note: null,
          startsAt: new Date('2030-01-14T00:00:00Z'),
          endsAt: new Date('2030-01-15T00:00:00Z'),
        },
      ],
      booked: [
        session('fits', '2030-01-07T11:00:00Z'), // Monday 11:00 London (GMT)
        session('too-early', '2030-01-07T09:00:00Z'), // Monday 09:00
        session('tuesday', '2030-01-08T11:00:00Z'), // no hours on Tuesdays
        session('time-off', '2030-01-14T11:00:00Z'), // Monday, but on time off
      ],
    });
    const { conflicts } = await controller.get(req);
    expect(conflicts.map((c) => c.id)).toEqual([
      'too-early',
      'tuesday',
      'time-off',
    ]);
  });
});
