import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DateTime, IANAZone } from 'luxon';
import { removeBrief } from '../briefs/brief-files.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthService } from './auth.service.js';
import {
  DEMO_CLIENT_NAME,
  DEMO_CONSULTANT,
  type DemoRole,
  demoAccounts,
  demoIdFor,
  demoIdOf,
  isDemoLoginEnabled,
} from './demo.js';
import { newToken } from './tokens.js';

// A pair nobody has been signed in to for this long (no live session) is removed on the next demo sign-in.
const STALE_AFTER_MS = 60 * 60_000;

/** The first weekday (Mon-Fri) on or after `daysFromToday`, at `hour` in the demo consultant's zone. */
function weekdayAt(zone: string, daysFromToday: number, hour: number) {
  let day = DateTime.now()
    .setZone(zone)
    .startOf('day')
    .plus({ days: daysFromToday });
  const step = daysFromToday < 0 ? -1 : 1;
  while (day.weekday > 5) day = day.plus({ days: step });
  return day.set({ hour });
}

/** Two upcoming sessions (more than 24 hours away, so they can be cancelled), one cancelled, one past. Inside Jason's hours. */
export const sampleSessions = (zone: string) => [
  { startsAt: weekdayAt(zone, 3, 11), cancelled: false },
  { startsAt: weekdayAt(zone, 8, 14), cancelled: false },
  { startsAt: weekdayAt(zone, 5, 13), cancelled: true },
  { startsAt: weekdayAt(zone, -4, 11), cancelled: false },
];

/** Private demo accounts for the deployed portfolio site, where email only reaches the owner. Off unless DEMO_LOGIN=true. */
@Injectable()
export class DemoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  /**
   * Signs into the visitor's own demo client or consultant, creating the pair on first use. `demoToken` is the
   * secret from their demo cookie; without one (a new visitor) a fresh pair is made.
   */
  async start(role: DemoRole, demoToken?: string, timezone?: string) {
    if (!isDemoLoginEnabled()) throw new NotFoundException();
    await this.removeStale();
    const token =
      demoToken && /^[\w-]{43}$/.test(demoToken) ? demoToken : newToken();
    const id = demoIdFor(token);
    await this.ensurePair(id, timezone);
    const sessionId = await this.auth.startSession(demoAccounts(id)[role]);
    return { sessionId, demoToken: token, role };
  }

  /** Puts the signed-in visitor's demo pair back to the defaults. They stay signed in. */
  async reset(email: string, timezone?: string) {
    const id = demoIdOf(email);
    if (!isDemoLoginEnabled() || !id)
      throw new ForbiddenException('Only demo accounts can be reset.');
    await this.remove(id, { signOut: false });
    await this.ensurePair(id, timezone);
  }

  /** The visitor's private consultant copy, for links to "your demo consultant". */
  async consultantFor(id: string) {
    return this.prisma.consultant.findUnique({
      where: { email: demoAccounts(id).consultant },
      select: { id: true },
    });
  }

  /** Creates the visitor's pair if it's missing: Jason in the visitor's own time zone, with sample sessions. */
  private async ensurePair(id: string, timezone?: string) {
    const { client, consultant } = demoAccounts(id);
    const zone =
      timezone && IANAZone.isValidZone(timezone)
        ? timezone
        : DEMO_CONSULTANT.timezone;
    // Both sides have their own editable name: Peter for the client, Jason for the consultant.
    // upsert: two tabs signing in at once must not both insert.
    for (const [email, name] of [
      [client, DEMO_CLIENT_NAME],
      [consultant, DEMO_CONSULTANT.name],
    ])
      await this.prisma.client.upsert({
        where: { email },
        create: { email, name, timezone: zone },
        update: {},
      });
    if (
      await this.prisma.consultant.findUnique({ where: { email: consultant } })
    )
      return;
    const { availability, ...profile } = DEMO_CONSULTANT;
    const copy = await this.prisma.consultant.create({
      data: {
        ...profile,
        timezone: zone,
        email: consultant,
        demoOwner: id,
        availability: { create: availability },
      },
    });
    // Sample sessions between the two demo accounts, so both sides have something to look at.
    for (const session of sampleSessions(zone)) {
      const startsAt = session.startsAt.toJSDate();
      await this.prisma.order.create({
        data: {
          consultantId: copy.id,
          clientName: DEMO_CLIENT_NAME,
          clientEmail: client,
          clientTimezone: zone,
          status: 'CONFIRMED',
          holdExpiresAt: new Date(),
          amountCents: copy.rateCents,
          bookings: {
            create: {
              consultantId: copy.id,
              startsAt,
              endsAt: new Date(startsAt.getTime() + copy.slotMinutes * 60_000),
              holdExpiresAt: new Date(),
              amountCents: copy.rateCents,
              status: session.cancelled ? 'CANCELLED' : 'CONFIRMED',
              cancelledBy: session.cancelled ? 'CLIENT' : null,
            },
          },
        },
      });
    }
  }

  /** Deletes everything one visitor's demo created: bookings either way (with brief files), the copy and its hours. */
  private async remove(id: string, { signOut }: { signOut: boolean }) {
    const emails = Object.values(demoAccounts(id));
    const copy = await this.prisma.consultant.findUnique({
      where: { email: demoAccounts(id).consultant },
      select: { id: true },
    });
    const orders = await this.prisma.order.findMany({
      where: {
        OR: [
          { clientEmail: { in: emails } },
          ...(copy ? [{ consultantId: copy.id }] : []),
        ],
      },
      select: { id: true },
    });
    for (const { id: orderId } of orders)
      await removeBrief(this.prisma, orderId);
    await this.prisma.order.deleteMany({
      where: { id: { in: orders.map((o) => o.id) } },
    }); // bookings cascade
    if (copy) await this.prisma.consultant.delete({ where: { id: copy.id } }); // hours and time off cascade
    await this.prisma.client.deleteMany({ where: { email: { in: emails } } });
    if (signOut)
      await this.prisma.session.deleteMany({
        where: { email: { in: emails } },
      });
  }

  /** Demo pairs are disposable: once no one is signed in to one, it goes, so the database doesn't fill up. */
  private async removeStale() {
    const copies = await this.prisma.consultant.findMany({
      where: {
        demoOwner: { not: null },
        createdAt: { lt: new Date(Date.now() - STALE_AFTER_MS) },
      },
      select: { demoOwner: true },
      take: 100,
    });
    const ids = copies.map((c) => c.demoOwner!);
    if (!ids.length) return;
    const live = await this.prisma.session.findMany({
      where: {
        email: { in: ids.flatMap((id) => Object.values(demoAccounts(id))) },
        expiresAt: { gt: new Date() },
      },
      select: { email: true },
    });
    const inUse = new Set(live.map((s) => demoIdOf(s.email)));
    for (const id of ids)
      if (!inUse.has(id)) await this.remove(id, { signOut: true });
  }
}
