import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import Stripe from 'stripe';

@Injectable()
export class StripeService {
  private client?: Stripe;

  // Created lazily so the API still boots (and slots still work) before Stripe keys are set.
  get stripe(): Stripe {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key)
      throw new ServiceUnavailableException(
        'Payments are not configured: set STRIPE_SECRET_KEY',
      );
    this.client ??= new Stripe(key);
    return this.client;
  }

  get webhookSecret(): string {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret)
      throw new ServiceUnavailableException(
        'Webhooks are not configured: set STRIPE_WEBHOOK_SECRET',
      );
    return secret;
  }
}
