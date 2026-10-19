// Minimal RFC 5545 calendar file: one event per session, enough for Google, Apple and Outlook calendars.
const stamp = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
const escape = (s: string) =>
  s
    .replace(/\\/g, '\\\\')
    .replace(/[,;]/g, (c) => `\\${c}`)
    .replace(/\n/g, '\\n');

export function orderInvite(order: {
  consultantName: string;
  clientName: string;
  sessions: { id: string; startsAt: Date; endsAt: Date }[];
}): string {
  const now = stamp(new Date());
  const events = order.sessions.flatMap((s) => [
    'BEGIN:VEVENT',
    `UID:${s.id}@consultly`,
    `DTSTAMP:${now}`,
    `DTSTART:${stamp(s.startsAt)}`,
    `DTEND:${stamp(s.endsAt)}`,
    `SUMMARY:${escape(`Consultation with ${order.consultantName}`)}`,
    `DESCRIPTION:${escape(`Booked by ${order.clientName} via Consultly.`)}`,
    'END:VEVENT',
  ]);
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Consultly//Bookings//EN',
    'METHOD:PUBLISH',
    ...events,
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}
