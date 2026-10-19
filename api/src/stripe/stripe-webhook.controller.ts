import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { OrdersService } from '../orders/orders.service.js';
import { StripeService } from './stripe.service.js';

@Controller('stripe')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    private readonly payments: StripeService,
    private readonly orders: OrdersService,
  ) {}

  // Stripe calls this; the signature proves the event really came from Stripe.
  @Post('webhook')
  @HttpCode(200)
  async handle(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    let event;
    try {
      // Must verify against the exact raw bytes, not re-serialised JSON.
      event = this.payments.stripe.webhooks.constructEvent(
        req.rawBody!,
        signature,
        this.payments.webhookSecret,
      );
    } catch (err) {
      throw new BadRequestException(
        `Invalid signature: ${(err as Error).message}`,
      );
    }

    if (
      event.type === 'checkout.session.completed' ||
      event.type === 'checkout.session.expired'
    ) {
      const session = event.data.object;
      const orderId = session.metadata?.orderId;
      if (!orderId) return { received: true };
      if (
        event.type === 'checkout.session.completed' &&
        session.payment_status === 'paid'
      ) {
        const paymentId =
          typeof session.payment_intent === 'string'
            ? session.payment_intent
            : session.payment_intent?.id;
        await this.orders.markPaid(orderId, paymentId);
      } else if (event.type === 'checkout.session.expired') {
        await this.orders.markExpired(orderId);
      }
      this.logger.log(`${event.type} → order ${orderId}`);
    }
    return { received: true };
  }
}
