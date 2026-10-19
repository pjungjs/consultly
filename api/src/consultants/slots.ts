import { DateTime } from 'luxon';

export interface WeeklyHours {
  weekday: number; // 1 = Monday ... 7 = Sunday
  startTime: string; // "09:00" in the consultant's timezone
  endTime: string;
}

export interface BlockingBooking {
  startsAt: Date;
  endsAt: Date;
}

export interface SlotInput {
  timezone: string;
  slotMinutes: number;
  availability: WeeklyHours[];
  bookings: BlockingBooking[]; // CONFIRMED, or PENDING with an unexpired hold
  now: Date;
  days: number;
}

const toTime = (hhmm: string) => {
  const [hour, minute] = hhmm.split(':').map(Number);
  return { hour, minute, second: 0, millisecond: 0 };
};

/**
 * Turns weekly wall-clock hours into concrete UTC slot start times.
 * Pure function: no database, no clock, so it is easy to test.
 */
export function generateSlots(input: SlotInput): string[] {
  const { timezone, slotMinutes, availability, bookings, now, days } = input;
  const start = DateTime.fromJSDate(now).setZone(timezone).startOf('day');
  const nowMs = now.getTime();
  const slots: string[] = [];

  for (let i = 0; i < days; i++) {
    const day = start.plus({ days: i });
    for (const hours of availability.filter((a) => a.weekday === day.weekday)) {
      let t = day.set(toTime(hours.startTime));
      const end = day.set(toTime(hours.endTime));
      while (t.plus({ minutes: slotMinutes }) <= end) {
        const slotStart = t.toMillis();
        const slotEnd = t.plus({ minutes: slotMinutes }).toMillis();
        const taken = bookings.some(
          (b) =>
            b.startsAt.getTime() < slotEnd && slotStart < b.endsAt.getTime(),
        );
        if (slotStart > nowMs && !taken) slots.push(t.toUTC().toISO()!);
        t = t.plus({ minutes: slotMinutes });
      }
    }
  }
  return slots;
}
