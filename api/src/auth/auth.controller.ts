import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { DateTime } from 'luxon';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { OrdersService } from '../orders/orders.service.js';
import { RateLimiter } from '../support/rate-limiter.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthService, SESSION_DAYS } from './auth.service.js';
import {
  DEMO_COOKIE,
  type DemoRole,
  demoIdOf,
  demoRoleOf,
  isDemoLoginEnabled,
} from './demo.js';
import { DemoService } from './demo.service.js';
import { listingStatus } from './listing-status.js';

import { COOKIE } from './session.js';

export { COOKIE };

// HttpOnly so page scripts can never read it; Lax so it isn't sent on cross-site POSTs.
function setCookie(res: Response, name: string, value: string) {
  res.cookie(name, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_DAYS * 86_400_000,
  });
}

class DemoTimezoneDto {
  // The visitor's browser zone: their demo consultant works in it, so times line up.
  @IsOptional()
  @IsString()
  timezone?: string;
}

class DemoDto extends DemoTimezoneDto {
  @IsIn(['client', 'consultant'])
  role: DemoRole;
}

class RequestLinkDto {
  @IsEmail()
  email: string;
}

class VerifyDto {
  @IsString()
  @IsNotEmpty()
  token: string;
}

@Controller()
export class AuthController {
  // 10 sign-in emails per hour per visitor.
  private readonly linkRequests = new RateLimiter(10, 60 * 60_000);
  // Demos started from the sign-in page, per visitor: each can create a client, a consultant and sample sessions.
  private readonly demoStartsPerMinute = new RateLimiter(5, 60_000);
  private readonly demoStartsPerHour = new RateLimiter(30, 60 * 60_000);
  // Each reset deletes and recreates a demo pair.
  private readonly demoResets = new RateLimiter(10, 60 * 60_000);

  constructor(
    private readonly auth: AuthService,
    private readonly demos: DemoService,
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
  ) {}

  @Post('auth/magic-link')
  @HttpCode(202)
  async requestLink(@Req() req: Request, @Body() dto: RequestLinkDto) {
    // Per visitor too, so one bot can't spray links across many addresses.
    if (!this.linkRequests.allow(req.ip ?? 'unknown'))
      throw new HttpException(
        'Too many sign-in requests from this network. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    await this.auth.requestLink(dto.email);
    return { sent: true };
  }

  @Post('auth/verify')
  @HttpCode(200)
  async verify(
    @Body() dto: VerifyDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    setCookie(res, COOKIE, await this.auth.verify(dto.token));
    return { signedIn: true };
  }

  /** Whether the "Try the demo" buttons should show (deployed portfolio site only). */
  @Get('auth/demo')
  demoAvailable() {
    return { enabled: isDemoLoginEnabled() };
  }

  @Post('auth/demo')
  @HttpCode(200)
  async demo(
    @Req() req: Request,
    @Body() dto: DemoDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Switching sides in the demo bar stays in the visitor's own demo, so only a start counts towards the limits.
    const switching = demoIdOf(
      await this.auth.emailFor(req.cookies?.[COOKIE]).catch(() => null),
    );
    const ip = req.ip ?? 'unknown';
    if (
      !switching &&
      !(this.demoStartsPerMinute.allow(ip) && this.demoStartsPerHour.allow(ip))
    )
      throw new HttpException(
        'Too many demos were started from this network recently. Please try again in a few minutes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    // Switching sides replaces the current sign-in rather than piling up sessions (unused demos get cleaned up).
    await this.auth.logout(req.cookies?.[COOKIE]);
    const { sessionId, demoToken, role } = await this.demos.start(
      dto.role,
      req.cookies?.[DEMO_COOKIE],
      dto.timezone,
    );
    setCookie(res, COOKIE, sessionId);
    setCookie(res, DEMO_COOKIE, demoToken);
    return { signedIn: true, role };
  }

  /** The signed-in visitor's demo client and consultant go back to the defaults. */
  @Post('auth/demo/reset')
  @HttpCode(200)
  async resetDemo(@Req() req: Request, @Body() dto: DemoTimezoneDto) {
    const email = await this.auth.emailFor(req.cookies?.[COOKIE]);
    if (!this.demoResets.allow(req.ip ?? 'unknown'))
      throw new HttpException(
        'The demo was reset several times recently. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    await this.demos.reset(email, dto.timezone);
    return { reset: true };
  }

  @Post('auth/logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[COOKIE]);
    res.clearCookie(COOKIE);
    return { signedIn: false };
  }

  /** Who is signed in, and whether that email also owns a consultant profile. */
  @Get('me')
  async me(@Req() req: Request) {
    const email = await this.auth.emailFor(req.cookies?.[COOKIE]);
    const consultant = await this.prisma.consultant.findUnique({
      where: { email },
      select: { id: true, name: true },
    });
    // The name from their profile prefills the booking form.
    const client = await this.auth.ensureClient(email);
    const demoId = demoIdOf(email);
    // Demo accounts: which side you're on, and your private consultant copy (for links to it).
    const demo = demoId && {
      role: demoRoleOf(email),
      consultantId: (await this.demos.consultantFor(demoId))?.id ?? null,
    };
    return {
      email,
      name: client.name,
      timezone: client.timezone,
      consultant,
      demo: demo || null,
    };
  }

  /** Everything the consultant dashboard shows, in one round trip. */
  @Get('me/consultant/dashboard')
  async consultantDashboard(@Req() req: Request) {
    const email = await this.auth.emailFor(req.cookies?.[COOKIE]);
    const consultant = await this.prisma.consultant.findUnique({
      where: { email },
    });
    if (!consultant)
      throw new ForbiddenException(
        'This email is not linked to a consultant profile',
      );

    // Booked sessions, plus ones cancelled after booking (cancelledBy is set) so the consultant sees them too.
    // Unpaid holds that simply expired are left out.
    const sessions = await this.prisma.booking.findMany({
      where: {
        consultantId: consultant.id,
        OR: [
          { status: 'CONFIRMED' },
          { status: 'CANCELLED', cancelledBy: { not: null } },
        ],
      },
      orderBy: { startsAt: 'asc' },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        amountCents: true,
        status: true,
        cancelledBy: true,
        order: {
          select: {
            id: true,
            clientName: true,
            clientEmail: true,
            clientTimezone: true,
            brief: { select: { status: true, source: true } },
          },
        },
      },
    });

    // "This week" means the consultant's own Sunday-to-Saturday, not UTC's. Luxon weekday: Sunday = 7.
    const sunday = DateTime.now().setZone(consultant.timezone).startOf('day');
    const weekStartDt = sunday.minus({ days: sunday.weekday % 7 });
    const weekStart = weekStartDt.toJSDate();
    const weekEnd = weekStartDt.plus({ days: 7 }).toJSDate();
    const upcoming = sessions.filter((b) => b.endsAt > new Date());
    // Past means sessions that took place: a cancelled one drops off once its time has gone by.
    const past = sessions
      .filter((b) => b.endsAt <= new Date() && b.status === 'CONFIRMED')
      .reverse();
    // Money and counts only include sessions that are still booked.
    const bookings = sessions.filter((b) => b.status === 'CONFIRMED');
    const sum = (list: typeof sessions) =>
      list.reduce((cents, b) => cents + b.amountCents, 0);

    return {
      consultant: {
        id: consultant.id,
        name: consultant.name,
        timezone: consultant.timezone,
        status: listingStatus({
          paused: consultant.paused,
          _count: {
            availability: await this.prisma.availability.count({
              where: { consultantId: consultant.id },
            }),
          },
        }),
      },
      stats: {
        thisWeekCents: sum(
          bookings.filter(
            (b) => b.startsAt >= weekStart && b.startsAt < weekEnd,
          ),
        ),
        upcomingCount: upcoming.filter((b) => b.status === 'CONFIRMED').length,
        earnedCents: sum(bookings),
      },
      upcoming,
      past,
    };
  }

  /** A consultant cancels one of their own paid sessions and refunds it. */
  @Post('me/consultant/bookings/:id/cancel')
  @HttpCode(200)
  async cancelSession(@Req() req: Request, @Param('id') id: string) {
    const email = await this.auth.emailFor(req.cookies?.[COOKIE]);
    const consultant = await this.prisma.consultant.findUnique({
      where: { email },
    });
    if (!consultant)
      throw new ForbiddenException(
        'This email is not linked to a consultant profile',
      );
    return this.orders.cancelSession(id, consultant.id);
  }

  /** The signed-in client's orders: matched by the email they paid with. */
  @Get('me/orders')
  async myOrders(@Req() req: Request) {
    const email = await this.auth.emailFor(req.cookies?.[COOKIE]);
    const orders = await this.prisma.order.findMany({
      where: {
        clientEmail: { equals: email, mode: 'insensitive' },
        status: 'CONFIRMED',
      },
      orderBy: { createdAt: 'desc' },
      include: {
        consultant: { select: { name: true, timezone: true } },
        bookings: {
          orderBy: { startsAt: 'asc' },
          select: {
            id: true,
            startsAt: true,
            endsAt: true,
            status: true,
            amountCents: true,
            cancelledBy: true,
          },
        },
        brief: { select: { status: true, source: true } },
      },
    });
    return { email, orders };
  }

  /** A client cancels one of their own sessions (free until 24 hours before it starts). */
  @Post('me/bookings/:id/cancel')
  @HttpCode(200)
  async cancelMyBooking(@Req() req: Request, @Param('id') id: string) {
    const email = await this.auth.emailFor(req.cookies?.[COOKIE]);
    return this.orders.cancelByClient(id, email);
  }
}
