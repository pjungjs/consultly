import {
  BadRequestException,
  Body,
  ConflictException,
  ForbiddenException,
  Controller,
  Get,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  IsTimeZone,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { Request } from 'express';
import { CATEGORIES } from '../consultants/categories.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { COOKIE } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { demoIdOf } from './demo.js';
import { listingStatus } from './listing-status.js';

/** Your name and time zone: one set for the whole account, also used by your consultant listing if you have one. */
export class ClientProfileDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsTimeZone()
  timezone: string;
}

/** The consultant-only settings. Name and time zone come from the account's profile. */
export class ConsultantProfileDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  headline: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  bio: string;

  @IsIn(CATEGORIES)
  category: string;

  /** Price of one session in cents: $10 to $1,000. */
  @IsInt()
  @Min(1000)
  @Max(100000)
  rateCents: number;

  /** Length of one session: 30 or 60 minutes. */
  @IsIn([30, 60])
  slotMinutes: number;
}

export class ConsultantStatusDto {
  @IsBoolean()
  paused: boolean;
}

/**
 * A demo visitor edits only their private pair. Opening a new consultant profile would publish their text in the
 * public catalogue, so the demo client can't; it already has its own demo consultant.
 */
function notForDemo(email: string) {
  if (demoIdOf(email))
    throw new ForbiddenException(
      'The demo already has its own consultant: switch to it from the demo bar. Sign in with your own email to open a consultant profile.',
    );
}

const CONSULTANT_FIELDS = {
  id: true,
  name: true,
  headline: true,
  bio: true,
  category: true,
  rateCents: true,
  slotMinutes: true,
  timezone: true,
  paused: true,
  _count: { select: { availability: true } },
} as const;

const withStatus = <
  T extends { paused: boolean; _count: { availability: number } },
>({
  _count,
  ...c
}: T) => ({
  ...c,
  status: listingStatus({ paused: c.paused, _count }),
});

/** Everyone edits their own details; consultants also edit their public profile. Email is the sign-in, so it isn't editable here. */
@Controller('me')
export class ProfileController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('profile')
  async get(@Req() req: Request) {
    const email = await this.auth.emailFor(req.cookies?.[COOKIE]);
    const [client, consultant] = await Promise.all([
      this.auth.ensureClient(email),
      this.prisma.consultant.findUnique({
        where: { email },
        select: CONSULTANT_FIELDS,
      }),
    ]);
    return {
      email,
      name: client.name ?? consultant?.name ?? null,
      timezone: client.timezone ?? consultant?.timezone ?? null,
      consultant: consultant && withStatus(consultant),
    };
  }

  /**
   * One name and time zone for the account. A consultant's listing uses them too. Changing the time zone keeps
   * the same wall-clock hours (09:00 stays 09:00 in the new zone); bookings that no longer fit show up as
   * conflicts in the Availability tab.
   */
  @Put('profile')
  async saveClient(@Req() req: Request, @Body() dto: ClientProfileDto) {
    const email = await this.auth.emailFor(req.cookies?.[COOKIE]);
    await this.auth.ensureClient(email);
    const data = { name: dto.name.trim(), timezone: dto.timezone };
    const [client] = await this.prisma.$transaction([
      this.prisma.client.update({ where: { email }, data }),
      this.prisma.consultant.updateMany({ where: { email }, data }),
    ]);
    return { name: client.name, timezone: client.timezone };
  }

  /** Changing the price affects new bookings only: each booking stores its own amount. */
  @Put('consultant/profile')
  async saveConsultant(@Req() req: Request, @Body() dto: ConsultantProfileDto) {
    const consultant = await this.auth.consultantFor(req.cookies?.[COOKIE]);
    const updated = await this.prisma.consultant.update({
      where: { id: consultant.id },
      data: {
        headline: dto.headline.trim(),
        bio: dto.bio.trim(),
        category: dto.category,
        rateCents: dto.rateCents,
        slotMinutes: dto.slotMinutes,
      },
      select: CONSULTANT_FIELDS,
    });
    return withStatus(updated);
  }

  /**
   * Self-serve: any signed-in client can open a consultant profile for their own email, under their profile's
   * name and time zone. It stays out of the catalogue until weekly hours are set. (In production this would go
   * through admin review.)
   */
  @Post('consultant')
  async becomeConsultant(
    @Req() req: Request,
    @Body() dto: ConsultantProfileDto,
  ) {
    const email = await this.auth.emailFor(req.cookies?.[COOKIE]);
    notForDemo(email);
    if (await this.prisma.consultant.findUnique({ where: { email } }))
      throw new ConflictException('You already have a consultant profile');
    const client = await this.auth.ensureClient(email);
    if (!client.name?.trim() || !client.timezone)
      throw new BadRequestException(
        'Save your name and time zone in your profile first.',
      );
    const created = await this.prisma.consultant.create({
      data: {
        email,
        name: client.name,
        timezone: client.timezone,
        headline: dto.headline.trim(),
        bio: dto.bio.trim(),
        category: dto.category,
        rateCents: dto.rateCents,
        slotMinutes: dto.slotMinutes,
      },
      select: CONSULTANT_FIELDS,
    });
    return withStatus(created);
  }

  /** Pause hides the profile and stops new bookings; existing bookings are kept. */
  @Put('consultant/status')
  async setStatus(@Req() req: Request, @Body() dto: ConsultantStatusDto) {
    const consultant = await this.auth.consultantFor(req.cookies?.[COOKIE]);
    const updated = await this.prisma.consultant.update({
      where: { id: consultant.id },
      data: { paused: dto.paused },
      select: CONSULTANT_FIELDS,
    });
    return withStatus(updated);
  }
}
