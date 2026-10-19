import {
  Body,
  Controller,
  ConflictException,
  Get,
  Header,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { COOKIE, sessionEmail } from '../auth/session.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RateLimiter } from '../support/rate-limiter.js';
import { CreateOrderDto } from './create-order.dto.js';
import { orderInvite } from './ics.js';
import { OrdersService } from './orders.service.js';

@Controller('orders')
export class OrdersController {
  // Each checkout holds times for 31 minutes: 10 per hour per visitor is plenty for a real person.
  private readonly checkouts = new RateLimiter(10, 60 * 60_000);

  constructor(
    private readonly orders: OrdersService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  async create(@Req() req: Request, @Body() dto: CreateOrderDto) {
    if (!this.checkouts.allow(req.ip ?? 'unknown'))
      throw new HttpException(
        'Too many booking attempts. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    return this.orders.create(
      dto,
      await sessionEmail(this.prisma, req.cookies?.[COOKIE]),
    );
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.orders.get(id);
  }

  @Post(':id/release')
  release(@Param('id') id: string) {
    return this.orders.release(id);
  }

  @Get(':id/invite.ics')
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="consultations.ics"')
  async invite(@Param('id') id: string) {
    const order = await this.orders.get(id);
    if (order.status !== 'CONFIRMED')
      throw new ConflictException(
        'Invite is available once payment is confirmed',
      );
    return orderInvite({
      consultantName: order.consultant.name,
      clientName: order.clientName,
      sessions: order.bookings.filter((b) => b.status !== 'CANCELLED'),
    });
  }
}
