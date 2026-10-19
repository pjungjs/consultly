import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service.js';
import { COOKIE } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AddTimeOffDto, SaveHoursDto } from './availability.dto.js';

/** A consultant's weekly hours and time off, edited from the dashboard. */
@Controller('me/consultant')
export class AvailabilityController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('availability')
  async get(@Req() req: Request) {
    const consultant = await this.auth.consultantFor(req.cookies?.[COOKIE]);
    return this.snapshot(consultant.id, consultant.timezone);
  }

  /** Replaces the whole week in one transaction, so a half-saved week can never exist. */
  @Put('availability')
  async saveHours(@Req() req: Request, @Body() dto: SaveHoursDto) {
    const consultant = await this.auth.consultantFor(req.cookies?.[COOKIE]);
    const days = new Set<number>();
    for (const h of dto.weekly) {
      if (h.startTime >= h.endTime)
        throw new BadRequestException(
          `End time must be after start time (${h.startTime}–${h.endTime})`,
        );
      if (days.has(h.weekday))
        throw new BadRequestException('One range per weekday');
      days.add(h.weekday);
    }
    await this.prisma.$transaction([
      this.prisma.availability.deleteMany({
        where: { consultantId: consultant.id },
      }),
      this.prisma.availability.createMany({
        data: dto.weekly.map((h) => ({
          weekday: h.weekday,
          startTime: h.startTime,
          endTime: h.endTime,
          consultantId: consultant.id,
        })),
      }),
    ]);
    return this.snapshot(consultant.id, consultant.timezone);
  }

  @Post('time-off')
  async addTimeOff(@Req() req: Request, @Body() dto: AddTimeOffDto) {
    const consultant = await this.auth.consultantFor(req.cookies?.[COOKIE]);
    // Whole days in the consultant's zone: from local midnight to the midnight after `to`.
    const startsAt = DateTime.fromISO(dto.from, {
      zone: consultant.timezone,
    }).startOf('day');
    const endsAt = DateTime.fromISO(dto.to, { zone: consultant.timezone })
      .plus({ days: 1 })
      .startOf('day');
    if (!startsAt.isValid || !endsAt.isValid || endsAt <= startsAt)
      throw new BadRequestException('"To" must be on or after "from"');
    await this.prisma.timeOff.create({
      data: {
        consultantId: consultant.id,
        startsAt: startsAt.toJSDate(),
        endsAt: endsAt.toJSDate(),
        note: dto.note?.trim() || null,
      },
    });
    return this.snapshot(consultant.id, consultant.timezone);
  }

  @Delete('time-off/:id')
  async removeTimeOff(@Req() req: Request, @Param('id') id: string) {
    const consultant = await this.auth.consultantFor(req.cookies?.[COOKIE]);
    const { count } = await this.prisma.timeOff.deleteMany({
      where: { id, consultantId: consultant.id },
    });
    if (count === 0) throw new NotFoundException('Time off not found');
    return this.snapshot(consultant.id, consultant.timezone);
  }

  /** Current hours, upcoming time off, and booked sessions that no longer fit them (kept, but flagged). */
  private async snapshot(consultantId: string, timezone: string) {
    const now = new Date();
    const [weekly, timeOff, booked] = await Promise.all([
      this.prisma.availability.findMany({
        where: { consultantId },
        orderBy: { weekday: 'asc' },
      }),
      this.prisma.timeOff.findMany({
        where: { consultantId, endsAt: { gt: now } },
        orderBy: { startsAt: 'asc' },
      }),
      this.prisma.booking.findMany({
        where: { consultantId, status: 'CONFIRMED', startsAt: { gt: now } },
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          order: { select: { clientName: true } },
        },
      }),
    ]);

    const conflicts = booked.filter((b) => {
      const start = DateTime.fromJSDate(b.startsAt).setZone(timezone);
      const end = DateTime.fromJSDate(b.endsAt).setZone(timezone);
      const hours = weekly.find((w) => w.weekday === start.weekday);
      const withinHours =
        !!hours &&
        start.toFormat('HH:mm') >= hours.startTime &&
        end.toFormat('HH:mm') <= hours.endTime;
      const duringTimeOff = timeOff.some(
        (t) => b.startsAt < t.endsAt && t.startsAt < b.endsAt,
      );
      return !withinHours || duringTimeOff;
    });

    return {
      timezone,
      weekly: weekly.map(({ weekday, startTime, endTime }) => ({
        weekday,
        startTime,
        endTime,
      })),
      timeOff: timeOff.map((t) => ({
        id: t.id,
        note: t.note,
        from: DateTime.fromJSDate(t.startsAt).setZone(timezone).toISODate(),
        to: DateTime.fromJSDate(t.endsAt)
          .setZone(timezone)
          .minus({ days: 1 })
          .toISODate(),
      })),
      conflicts: conflicts.map((b) => ({
        id: b.id,
        startsAt: b.startsAt,
        clientName: b.order.clientName,
      })),
    };
  }
}
