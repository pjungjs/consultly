import { Module } from '@nestjs/common';
import { ConsultantsModule } from '../consultants/consultants.module.js';
import { EmailService } from '../email/email.service.js';
import { StripeWebhookController } from '../stripe/stripe-webhook.controller.js';
import { StripeService } from '../stripe/stripe.service.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

@Module({
  imports: [ConsultantsModule],
  controllers: [OrdersController, StripeWebhookController],
  providers: [OrdersService, StripeService, EmailService],
  exports: [OrdersService],
})
export class OrdersModule {}
