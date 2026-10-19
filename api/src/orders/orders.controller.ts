import {
  Body,
  Controller,
  ConflictException,
  Get,
  Header,
  Param,
  Post,
} from '@nestjs/common';
import { CreateOrderDto } from './create-order.dto.js';
import { orderInvite } from './ics.js';
import { OrdersService } from './orders.service.js';

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  create(@Body() dto: CreateOrderDto) {
    return this.orders.create(dto);
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
