import {
  BadGatewayException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { EmailService } from '../email/email.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { sessionEmail } from './session.js';
import { hashToken, newToken } from './tokens.js';

const LINK_MINUTES = 15;
// At most this many sign-in links per address per LINK_MINUTES: stops inbox flooding and burning the email quota.
export const LINKS_PER_ADDRESS = 3;
export const SESSION_DAYS = 7;

// Only outside production may the API hand a sign-in link back to the browser.
export const isDevMode = () => process.env.NODE_ENV !== 'production';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  /**
   * Emails a one-time sign-in link. Every address is treated the same way, so the
   * response never reveals whether an email has bookings. A delivery failure is reported, though:
   * it says nothing about accounts, and hiding it leaves people waiting for an email that won't come.
   */
  async requestLink(rawEmail: string) {
    const email = rawEmail.trim().toLowerCase();
    // Counted in the database, so the limit holds across restarts. Same answer for every address, so it
    // reveals nothing about which emails have accounts.
    const recent = await this.prisma.loginToken.count({
      where: {
        email,
        createdAt: { gt: new Date(Date.now() - LINK_MINUTES * 60_000) },
      },
    });
    if (recent >= LINKS_PER_ADDRESS)
      throw new HttpException(
        'Several sign-in links were sent to this address recently. Use the latest one, or try again in a few minutes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    const token = newToken();
    await this.prisma.loginToken.create({
      data: {
        email,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + LINK_MINUTES * 60_000),
      },
    });
    const link = `${process.env.WEB_URL ?? 'http://localhost:3000'}/my-bookings/verify?token=${token}`;
    try {
      await this.email.send(
        email,
        'Your Consultly sign-in link',
        `Open this link to see your bookings. It works once and expires in ${LINK_MINUTES} minutes:\n${link}`,
        `<p>Open this link to see your bookings. It works once and expires in ${LINK_MINUTES} minutes.</p><p><a href="${link}">See my bookings</a></p>`,
      );
    } catch (err) {
      const reason = (err as Error).message;
      this.logger.error(reason);
      throw new BadGatewayException({
        message: `We couldn't send an email to ${email}. Please try again in a few minutes.`,
        // Local testing only; a production server never returns the link.
        ...(isDevMode() && { devReason: reason, devLink: link }),
      });
    }
  }

  /** Spends the link (single use) and starts a session. Returns the raw session id for the cookie. */
  async verify(token: string) {
    const now = new Date();
    // updateMany with the conditions in WHERE makes "check and mark used" one atomic step,
    // so two clicks racing each other can't both succeed.
    const { count } = await this.prisma.loginToken.updateMany({
      where: {
        tokenHash: hashToken(token),
        usedAt: null,
        expiresAt: { gt: now },
      },
      data: { usedAt: now },
    });
    if (count === 0)
      throw new UnauthorizedException(
        'This link has expired or was already used. Request a new one.',
      );

    const { email } = await this.prisma.loginToken.findUniqueOrThrow({
      where: { tokenHash: hashToken(token) },
    });
    return this.startSession(email);
  }

  /** Creates a session for this email and returns the raw id for the cookie (only its hash is stored). */
  async startSession(email: string) {
    const sessionId = newToken();
    await this.prisma.session.create({
      data: {
        email,
        tokenHash: hashToken(sessionId),
        expiresAt: new Date(Date.now() + SESSION_DAYS * 86_400_000),
      },
    });
    return sessionId;
  }

  /** Resolves the cookie to an email, or throws 401. */
  async emailFor(sessionId: string | undefined) {
    if (!sessionId) throw new UnauthorizedException('Not signed in');
    const email = await sessionEmail(this.prisma, sessionId);
    if (!email) throw new UnauthorizedException('Session expired');
    return email;
  }

  /** The consultant profile behind this session, or 403. */
  async consultantFor(sessionId: string | undefined) {
    const email = await this.emailFor(sessionId);
    const consultant = await this.prisma.consultant.findUnique({
      where: { email },
    });
    if (!consultant)
      throw new ForbiddenException(
        'This email is not linked to a consultant profile',
      );
    return consultant;
  }

  /** The client's own record, created the first time we see this email (name from their latest booking). */
  async ensureClient(email: string) {
    const existing = await this.prisma.client.findUnique({ where: { email } });
    if (existing) return existing;
    const last = await this.prisma.order.findFirst({
      where: { clientEmail: { equals: email, mode: 'insensitive' } },
      orderBy: { createdAt: 'desc' },
      select: { clientName: true, clientTimezone: true },
    });
    // A consultant's name doubles as their own name until they change it.
    const consultant = await this.prisma.consultant.findUnique({
      where: { email },
      select: { name: true, timezone: true },
    });
    // upsert, not create: two tabs loading at once must not both try to insert.
    return this.prisma.client.upsert({
      where: { email },
      create: {
        email,
        name: last?.clientName ?? consultant?.name ?? null,
        timezone: last?.clientTimezone ?? consultant?.timezone ?? null,
      },
      update: {},
    });
  }

  async logout(sessionId: string | undefined) {
    if (sessionId)
      await this.prisma.session.deleteMany({
        where: { tokenHash: hashToken(sessionId) },
      });
  }
}
