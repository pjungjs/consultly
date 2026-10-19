import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { DateTime } from 'luxon';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { OrdersService } from '../orders/orders.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthService, SESSION_DAYS } from './auth.service.js';
import { listingStatus } from './listing-status.js';

export const COOKIE = 'consultly_session';

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
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
  ) {}

  @Post('auth/magic-link')
  @HttpCode(202)
  async requestLink(@Body() dto: RequestLinkDto) {
    await this.auth.requestLink(dto.email);
    return { sent: true };
  }

  @Post('auth/verify')
  @HttpCode(200)
  async verify(
    @Body() dto: VerifyDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const sessionId = await this.auth.verify(dto.token);
    // HttpOnly so page scripts can never read it; Lax so it isn't sent on cross-site POSTs.
    res.cookie(COOKIE, sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_DAYS * 86_400_000,
    });
    return { signedIn: true };
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
    return { email, name: client.name, timezone: client.timezone, consultant };
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

    const bookings = await this.prisma.booking.findMany({
      where: { consultantId: consultant.id, status: 'CONFIRMED' },
      orderBy: { startsAt: 'asc' },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        amountCents: true,
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
    const upcoming = bookings.filter((b) => b.endsAt > new Date());
    const past = bookings.filter((b) => b.endsAt <= new Date()).reverse();
    const sum = (list: typeof bookings) =>
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
        upcomingCount: upcoming.length,
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
