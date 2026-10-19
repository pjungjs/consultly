import {
  Body,
  ConflictException,
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
import { listingStatus } from './listing-status.js';

export class ClientProfileDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsTimeZone()
  timezone: string;
}

export class ConsultantProfileDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

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

  @IsTimeZone()
  timezone: string;
}

export class ConsultantStatusDto {
  @IsBoolean()
  paused: boolean;
}

const CONSULTANT_FIELDS = {
  id: true,
  name: true,
  headline: true,
  bio: true,
  category: true,
  rateCents: true,
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
      name: client.name,
      timezone: client.timezone,
      consultant: consultant && withStatus(consultant),
    };
  }

  @Put('profile')
  async saveClient(@Req() req: Request, @Body() dto: ClientProfileDto) {
    const email = await this.auth.emailFor(req.cookies?.[COOKIE]);
    await this.auth.ensureClient(email);
    const client = await this.prisma.client.update({
      where: { email },
      data: { name: dto.name.trim(), timezone: dto.timezone },
    });
    return { name: client.name, timezone: client.timezone };
  }

  /**
   * Changing the price affects new bookings only: each booking stores its own amount.
   * Changing the time zone keeps the same wall-clock hours (09:00 stays 09:00 in the new zone);
   * bookings that no longer fit show up as conflicts in the Availability tab.
   */
  @Put('consultant/profile')
  async saveConsultant(@Req() req: Request, @Body() dto: ConsultantProfileDto) {
    const consultant = await this.auth.consultantFor(req.cookies?.[COOKIE]);
    const updated = await this.prisma.consultant.update({
      where: { id: consultant.id },
      data: {
        name: dto.name.trim(),
        headline: dto.headline.trim(),
        bio: dto.bio.trim(),
        category: dto.category,
        rateCents: dto.rateCents,
        timezone: dto.timezone,
      },
      select: CONSULTANT_FIELDS,
    });
    return withStatus(updated);
  }

  /**
   * Self-serve: any signed-in client can open a consultant profile for their own email.
   * It stays out of the catalogue until weekly hours are set. (In production this would go through admin review.)
   */
  @Post('consultant')
  async becomeConsultant(
    @Req() req: Request,
    @Body() dto: ConsultantProfileDto,
  ) {
    const email = await this.auth.emailFor(req.cookies?.[COOKIE]);
    if (await this.prisma.consultant.findUnique({ where: { email } }))
      throw new ConflictException('You already have a consultant profile');
    const created = await this.prisma.consultant.create({
      data: {
        email,
        name: dto.name.trim(),
        headline: dto.headline.trim(),
        bio: dto.bio.trim(),
        category: dto.category,
        rateCents: dto.rateCents,
        timezone: dto.timezone,
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
