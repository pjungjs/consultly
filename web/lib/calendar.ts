// Pure date and list helpers behind the calendars and lists, kept out of components so they can be unit-tested.

export type Day = { date: Date; state: "past" | "open" | "later"; isos: string[] };

/**
 * Sunday-to-Saturday weeks in the browser's timezone, covering `windowDays` from today.
 * Each day carries its slots; days before today are "past", days past the window are "later".
 */
export function buildWeeks(slots: string[], now: number, windowDays: number): Day[][] {
  const dayKey = (d: Date) => d.toLocaleDateString("en-CA");
  const byDay = new Map<string, string[]>();
  for (const iso of slots) byDay.set(dayKey(new Date(iso)), [...(byDay.get(dayKey(new Date(iso))) ?? []), iso]);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const windowEnd = new Date(today);
  windowEnd.setDate(today.getDate() + windowDays);
  const result: Day[][] = [];
  const d = new Date(today);
  d.setDate(today.getDate() - today.getDay()); // back to Sunday
  while (d < windowEnd) {
    const week: Day[] = [];
    for (let i = 0; i < 7; i++, d.setDate(d.getDate() + 1)) {
      const state = d < today ? "past" : d >= windowEnd ? "later" : "open";
      week.push({ date: new Date(d), state, isos: byDay.get(dayKey(d)) ?? [] });
    }
    result.push(week);
  }
  // The window usually clips into a third week; drop it when nothing is open there.
  while (result.length > 1 && result.at(-1)!.every((day) => day.isos.length === 0)) result.pop();
  return result;
}

/** A month as "YYYY-MM-DD" cells, with blanks (null) so day 1 lands under its weekday, Sunday first. */
export function monthCells(year: number, month: number): (string | null)[] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return [
    ...Array.from({ length: first.getUTCDay() }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${year}-${String(month).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`),
  ];
}

/** One page of `rows`; an out-of-range page (e.g. after filtering shrank the list) clamps to the last one. */
export function paginate<T>(rows: T[], page: number, size: number) {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(Math.max(page, 0), pages - 1);
  return { pages, current, rows: rows.slice(current * size, (current + 1) * size) };
}

/** "YYYY-MM-DD" of an instant in `zone` (the browser's zone when omitted). */
export const dayKey = (iso: string | number | Date, zone?: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: zone });

/** Calendar arithmetic on "YYYY-MM-DD" keys, done in UTC so no timezone or DST can shift the date. */
export function addDays(key: string, days: number) {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The Sunday-to-Saturday week containing `key`, `offset` weeks later. */
export function weekKeys(key: string, offset = 0): string[] {
  const sunday = addDays(key, -new Date(`${key}T00:00:00Z`).getUTCDay() + offset * 7);
  return Array.from({ length: 7 }, (_, i) => addDays(sunday, i));
}

/** { y, m } (m is 1-12) moved by `delta` months. */
export function shiftMonth({ y, m }: { y: number; m: number }, delta: number) {
  const n = m - 1 + delta;
  return { y: y + Math.floor(n / 12), m: (((n % 12) + 12) % 12) + 1 };
}

/** Label for a day key without letting the browser's zone move it, e.g. "Mon, Oct 26". */
export const keyLabel = (key: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${key}T12:00:00Z`).toLocaleDateString(undefined, { ...opts, timeZone: "UTC" });
