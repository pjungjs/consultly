import { AuthController } from './auth.controller.js';

const HOUR = 3_600_000;
const at = (hoursFromNow: number) => new Date(Date.now() + hoursFromNow * HOUR);
const session = (id: string, hoursFromNow: number, status: string) => ({
  id,
  startsAt: at(hoursFromNow),
  endsAt: at(hoursFromNow + 1),
  amountCents: 20000,
  status,
  cancelledBy: status === 'CANCELLED' ? 'CLIENT' : null,
  order: {
    id: 'o-' + id,
    clientName: 'Dana',
    clientEmail: 'dana@example.com',
    clientTimezone: 'UTC',
    brief: null,
  },
});

function dashboard(sessions: ReturnType<typeof session>[]) {
  const prisma = {
    consultant: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'c1',
        name: 'Jason',
        timezone: 'UTC',
        paused: false,
      }),
    },
    booking: { findMany: vi.fn().mockResolvedValue(sessions) },
    availability: { count: vi.fn().mockResolvedValue(5) },
  };
  const auth = { emailFor: vi.fn().mockResolvedValue('jason@example.com') };
  const controller = new AuthController(
    auth as never,
    {} as never,
    prisma as never,
    {} as never,
  );
  return controller.consultantDashboard({ cookies: {} } as never);
}

describe('consultant dashboard', () => {
  it('keeps cancelled sessions in Upcoming until their time, but never lists them under Past', async () => {
    const { upcoming, past, stats } = await dashboard([
      session('past-paid', -48, 'CONFIRMED'),
      session('past-cancelled', -24, 'CANCELLED'),
      session('next-paid', 24, 'CONFIRMED'),
      session('next-cancelled', 48, 'CANCELLED'),
    ]);
    expect(upcoming.map((s) => s.id)).toEqual(['next-paid', 'next-cancelled']);
    expect(past.map((s) => s.id)).toEqual(['past-paid']);
    expect(stats.upcomingCount).toBe(1);
    expect(stats.earnedCents).toBe(40000);
  });
});

describe('demo sign-in limits', () => {
  function demoController(signedInAs: string | null) {
    const auth = {
      emailFor: signedInAs
        ? vi.fn().mockResolvedValue(signedInAs)
        : vi.fn().mockRejectedValue(new Error('Not signed in')),
      logout: vi.fn(),
    };
    const demos = {
      start: vi.fn().mockResolvedValue({
        sessionId: 's',
        demoToken: 't',
        role: 'client',
      }),
    };
    const controller = new AuthController(
      auth as never,
      demos as never,
      {} as never,
      {} as never,
    );
    const res = { cookie: vi.fn() } as never;
    const req = { ip: '1.2.3.4', cookies: {} } as never;
    return (role: 'client' | 'consultant') =>
      controller.demo(req, { role } as never, res);
  }

  it('allows five new demos a minute from one network', async () => {
    const start = demoController(null);
    for (let i = 0; i < 5; i++) await start('client');
    await expect(start('client')).rejects.toMatchObject({ status: 429 });
  });

  it('never counts switching sides inside a demo', async () => {
    const switchTo = demoController('demo-0123456789ab@consultly.test');
    for (let i = 0; i < 12; i++)
      await switchTo(i % 2 ? 'client' : 'consultant');
  });
});
