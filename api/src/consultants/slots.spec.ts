import { generateSlots, type SlotInput } from './slots.js';

const weekdays9to5 = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday,
  startTime: '09:00',
  endTime: '17:00',
}));

const base: SlotInput = {
  timezone: 'America/New_York',
  slotMinutes: 60,
  availability: weekdays9to5,
  bookings: [],
  now: new Date('2026-10-18T12:00:00Z'), // Sunday
  days: 1,
};

describe('generateSlots', () => {
  it('turns local working hours into UTC slot starts', () => {
    const slots = generateSlots({
      ...base,
      now: new Date('2026-10-19T04:00:00Z'),
    }); // Monday 00:00 NY
    expect(slots).toHaveLength(8);
    expect(slots[0]).toBe('2026-10-19T13:00:00.000Z'); // 09:00 EDT
    expect(slots.at(-1)).toBe('2026-10-19T20:00:00.000Z'); // 16:00 EDT, last slot that ends by 17:00
  });

  it('skips days with no availability', () => {
    expect(generateSlots(base)).toEqual([]); // Sunday
  });

  it('keeps 09:00 local across a daylight-saving change', () => {
    // London leaves BST on Sunday 25 Oct 2026.
    const slots = generateSlots({
      ...base,
      timezone: 'Europe/London',
      availability: [
        { weekday: 5, startTime: '09:00', endTime: '10:00' },
        { weekday: 1, startTime: '09:00', endTime: '10:00' },
      ],
      now: new Date('2026-10-22T12:00:00Z'),
      days: 5,
    });
    expect(slots).toEqual([
      '2026-10-23T08:00:00.000Z',
      '2026-10-26T09:00:00.000Z',
    ]);
  });

  it('hides slots that overlap a blocking booking', () => {
    const slots = generateSlots({
      ...base,
      now: new Date('2026-10-19T04:00:00Z'),
      bookings: [
        {
          startsAt: new Date('2026-10-19T14:00:00Z'),
          endsAt: new Date('2026-10-19T15:00:00Z'),
        },
      ],
    });
    expect(slots).not.toContain('2026-10-19T14:00:00.000Z');
    expect(slots).toHaveLength(7);
  });

  it('hides slots that have already started', () => {
    const slots = generateSlots({
      ...base,
      now: new Date('2026-10-19T15:30:00Z'),
    }); // 11:30 NY Monday
    expect(slots[0]).toBe('2026-10-19T16:00:00.000Z'); // 12:00 NY
  });
});
