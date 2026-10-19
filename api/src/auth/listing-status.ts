/** "live": in the catalogue; "needs-hours": hidden until weekly hours are set; "paused": hidden by the consultant. */
export function listingStatus(c: {
  paused: boolean;
  _count: { availability: number };
}) {
  return c.paused
    ? 'paused'
    : c._count.availability === 0
      ? 'needs-hours'
      : 'live';
}
