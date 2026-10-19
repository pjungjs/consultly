import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import { Prisma, type BookingStatus } from '../generated/prisma/client.js';
import { ConsultantsService } from '../consultants/consultants.service.js';
import { EmailService } from '../email/email.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StripeService } from '../stripe/stripe.service.js';
import type { CreateOrderDto } from './create-order.dto.js';
import { orderInvite } from './ics.js';
import { removeBrief } from '../briefs/brief-files.js';

// How close to the start a client may still cancel online for a full refund.
export const CLIENT_CANCEL_HOURS = 24;

type CancelledBy = 'CLIENT' | 'CONSULTANT';

// Stripe Checkout sessions must live at least 30 minutes; one extra minute covers request latency.
const HOLD_MINUTES = 31;

// Client-typed text goes into email HTML, so escape it.
const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly consultants: ConsultantsService,
    private readonly payments: StripeService,
    private readonly email: EmailService,
  ) {}

  /** Holds every requested slot (all or nothing) and returns one Stripe Checkout URL. */
  async create(dto: CreateOrderDto) {
    const consultant = await this.consultants.get(dto.consultantId);
    if (
      consultant.email &&
      consultant.email.toLowerCase() === dto.clientEmail.trim().toLowerCase()
    ) {
      throw new BadRequestException(
        "You can't book sessions on your own profile.",
      );
    }
    const starts = dto.startsAt
      .map((s) => new Date(s))
      .sort((a, b) => a.getTime() - b.getTime());

    // Only slots the schedule actually offers can be booked (no arbitrary times).
    const { slots } = await this.consultants.slots(consultant.id);
    const unavailable = starts.filter((d) => !slots.includes(d.toISOString()));
    if (unavailable.length) {
      throw new ConflictException(
        unavailable.length === 1
          ? 'One of those times was just taken. Please pick again.'
          : `${unavailable.length} of those times were just taken. Please pick again.`,
      );
    }

    const now = new Date();
    const holdExpiresAt = new Date(now.getTime() + HOLD_MINUTES * 60_000);
    const slotMs = consultant.slotMinutes * 60_000;

    let order;
    try {
      order = await this.prisma.$transaction(async (tx) => {
        // An expired hold still counts for the unique index, so release it first.
        await tx.booking.updateMany({
          where: {
            consultantId: consultant.id,
            startsAt: { in: starts },
            status: 'PENDING',
            holdExpiresAt: { lte: now },
          },
          data: { status: 'CANCELLED' },
        });
        // One transaction: if any slot hits the unique index, none of them are held.
        return tx.order.create({
          data: {
            consultantId: consultant.id,
            clientName: dto.clientName,
            clientEmail: dto.clientEmail.trim().toLowerCase(),
            clientTimezone: dto.clientTimezone ?? 'UTC',
            holdExpiresAt,
            amountCents: consultant.rateCents * starts.length,
            bookings: {
              create: starts.map((startsAt) => ({
                consultantId: consultant.id,
                startsAt,
                endsAt: new Date(startsAt.getTime() + slotMs),
                holdExpiresAt,
                amountCents: consultant.rateCents,
              })),
            },
          },
        });
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          'Someone just booked one of those times. Please pick again.',
        );
      }
      throw err;
    }

    // Network call to Stripe happens outside the DB transaction, so no lock is held while we wait.
    const web = process.env.WEB_URL ?? 'http://localhost:3000';
    try {
      const session = await this.payments.stripe.checkout.sessions.create({
        mode: 'payment',
        customer_email: dto.clientEmail,
        line_items: [
          {
            quantity: starts.length,
            price_data: {
              currency: 'usd',
              unit_amount: consultant.rateCents,
              product_data: {
                name: `${consultant.slotMinutes}-minute consultation with ${consultant.name}`,
                description: starts.map((d) => d.toUTCString()).join(' · '),
              },
            },
          },
        ],
        metadata: { orderId: order.id },
        expires_at: Math.floor(holdExpiresAt.getTime() / 1000),
        success_url: `${web}/orders/${order.id}`,
        cancel_url: `${web}/orders/${order.id}/cancelled`,
      });
      await this.prisma.order.update({
        where: { id: order.id },
        data: { stripeSessionId: session.id },
      });
      return { orderId: order.id, checkoutUrl: session.url };
    } catch (err) {
      await this.setStatus(order.id, 'CANCELLED', 'PENDING');
      throw err;
    }
  }

  async get(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
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
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  /** Client backed out of Checkout: free the slots now instead of waiting for the hold to expire. */
  async release(id: string) {
    const order = await this.get(id);
    if (order.status !== 'PENDING') return order;
    if (order.stripeSessionId) {
      await this.payments.stripe.checkout.sessions
        .expire(order.stripeSessionId)
        .catch((err: Error) => {
          this.logger.warn(
            `Could not expire session ${order.stripeSessionId}: ${err.message}`,
          );
        });
    }
    await this.setStatus(id, 'CANCELLED', 'PENDING');
    return this.get(id);
  }

  /** Called from the webhook. Idempotent: Stripe may deliver the same event more than once. */
  async markPaid(orderId: string, paymentId?: string) {
    const changed = await this.setStatus(orderId, 'CONFIRMED', 'PENDING');
    if (paymentId)
      await this.prisma.order.update({
        where: { id: orderId },
        data: { stripePaymentId: paymentId },
      });
    // Only the delivery that actually confirmed the order sends the email, so retries don't send duplicates.
    if (changed) await this.sendConfirmation(orderId);
    if (!changed) {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
      });
      if (order?.status === 'CANCELLED')
        this.logger.error(
          `Order ${orderId} was paid after it was cancelled: needs a refund`,
        );
    }
  }

  async markExpired(orderId: string) {
    await this.setStatus(orderId, 'CANCELLED', 'PENDING');
  }

  /** The consultant cancels one paid session; that session's price goes back to the client's card. */
  async cancelSession(bookingId: string, consultantId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { order: true },
    });
    if (!booking || booking.consultantId !== consultantId)
      throw new NotFoundException('Session not found');
    if (booking.status !== 'CONFIRMED')
      throw new ConflictException('Only booked sessions can be cancelled');
    if (booking.startsAt <= new Date())
      throw new ForbiddenException('This session has already started');
    return this.refundAndCancel(booking, 'CONSULTANT');
  }

  /** The client cancels one of their own sessions: free until CLIENT_CANCEL_HOURS before it starts. */
  async cancelByClient(bookingId: string, email: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { order: true },
    });
    // Someone else's booking looks the same as a missing one, so ids can't be probed.
    if (
      !booking ||
      booking.order.clientEmail.toLowerCase() !== email.toLowerCase()
    )
      throw new NotFoundException('Session not found');
    if (booking.status !== 'CONFIRMED')
      throw new ConflictException('Only booked sessions can be cancelled');
    if (
      booking.startsAt.getTime() - Date.now() <=
      CLIENT_CANCEL_HOURS * 3_600_000
    ) {
      throw new ForbiddenException(
        `Sessions can only be cancelled online up to ${CLIENT_CANCEL_HOURS} hours before they start. Please contact your consultant.`,
      );
    }
    return this.refundAndCancel(booking, 'CLIENT');
  }

  private async refundAndCancel(
    booking: Prisma.BookingGetPayload<{ include: { order: true } }>,
    by: CancelledBy,
  ) {
    // Orders paid before we stored the payment id: look it up from the Checkout session.
    let paymentId = booking.order.stripePaymentId;
    if (!paymentId && booking.order.stripeSessionId) {
      const session = await this.payments.stripe.checkout.sessions.retrieve(
        booking.order.stripeSessionId,
      );
      paymentId =
        typeof session.payment_intent === 'string'
          ? session.payment_intent
          : (session.payment_intent?.id ?? null);
    }
    if (!paymentId) throw new ConflictException('No payment found to refund');

    // Idempotency key: a double-click or retry can never refund the same session twice.
    const refund = await this.payments.stripe.refunds.create(
      {
        payment_intent: paymentId,
        amount: booking.amountCents,
        metadata: { bookingId: booking.id, cancelledBy: by },
      },
      { idempotencyKey: `refund-${booking.id}` },
    );
    // CANCELLED drops the booking out of the one-active-booking-per-slot index, so the time reopens.
    await this.prisma.booking.update({
      where: { id: booking.id },
      data: { status: 'CANCELLED', refundId: refund.id, cancelledBy: by },
    });
    // Nothing left to prepare for: the brief and its file go once every session in the order is cancelled.
    const remaining = await this.prisma.booking.count({
      where: { orderId: booking.orderId, status: 'CONFIRMED' },
    });
    if (remaining === 0) await removeBrief(this.prisma, booking.orderId);
    await this.sendCancellation(booking.id, by);
    return { cancelled: true, refundedCents: booking.amountCents };
  }

  /** Both sides hear about a cancellation; whoever cancelled gets a receipt-style note. */
  private async sendCancellation(bookingId: string, by: CancelledBy) {
    const b = await this.prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: {
        order: true,
        consultant: { select: { name: true, email: true, timezone: true } },
      },
    });
    const at = (zone: string) =>
      DateTime.fromJSDate(b.startsAt)
        .setZone(zone)
        .toLocaleString(DateTime.DATETIME_MED_WITH_WEEKDAY);
    const clientWhen = at(b.order.clientTimezone);
    const amount = `$${(b.amountCents / 100).toFixed(2)}`;
    const refundNote = `We've refunded ${amount} to your card; it usually appears within 5-10 business days.`;
    const mails: [string, string, string, string][] = [
      by === 'CONSULTANT'
        ? [
            b.order.clientEmail,
            `Cancelled: ${clientWhen} with ${b.consultant.name}`,
            `Hi ${b.order.clientName},\n\n${b.consultant.name} had to cancel your session on ${clientWhen}. ${refundNote}`,
            `<p>Hi ${esc(b.order.clientName)},</p><p>${esc(b.consultant.name)} had to cancel your session on <strong>${clientWhen}</strong>.</p><p>${refundNote}</p>`,
          ]
        : [
            b.order.clientEmail,
            `You cancelled: ${clientWhen} with ${b.consultant.name}`,
            `Hi ${b.order.clientName},\n\nYour session with ${b.consultant.name} on ${clientWhen} is cancelled. ${refundNote}`,
            `<p>Hi ${esc(b.order.clientName)},</p><p>Your session with ${esc(b.consultant.name)} on <strong>${clientWhen}</strong> is cancelled.</p><p>${refundNote}</p>`,
          ],
    ];
    if (by === 'CLIENT' && b.consultant.email) {
      const consultantWhen = at(b.consultant.timezone);
      mails.push([
        b.consultant.email,
        `${b.order.clientName} cancelled ${consultantWhen}`,
        `${b.order.clientName} cancelled their session on ${consultantWhen}. They've been refunded and the time is open again for booking.`,
        `<p>${esc(b.order.clientName)} cancelled their session on <strong>${consultantWhen}</strong>.</p><p>They've been refunded and the time is open again for booking.</p>`,
      ]);
    }
    for (const [to, subject, text, html] of mails) {
      try {
        await this.email.send(to, subject, text, html);
      } catch (err) {
        // The refund already happened; a failed email must not turn the cancellation into an error.
        this.logger.error(
          `Cancellation email for booking ${bookingId} failed: ${(err as Error).message}`,
        );
      }
    }
  }

  private async sendConfirmation(orderId: string) {
    const order = await this.get(orderId);
    const when = (d: Date) =>
      DateTime.fromJSDate(d)
        .setZone(order.clientTimezone)
        .toLocaleString(DateTime.DATETIME_MED_WITH_WEEKDAY);
    const lines = order.bookings.map((b) => when(b.startsAt));
    const receipt = `${process.env.WEB_URL ?? 'http://localhost:3000'}/orders/${order.id}`;
    const total = `$${(order.amountCents / 100).toFixed(2)}`;
    try {
      await this.email.send(
        order.clientEmail,
        `Booked: ${lines.length} session${lines.length > 1 ? 's' : ''} with ${order.consultant.name}`,
        `Hi ${order.clientName},\n\nYou're booked with ${order.consultant.name}:\n${lines.map((l) => `- ${l}`).join('\n')}\n\nPaid: ${total}\nReceipt: ${receipt}\n\nThe attached calendar file adds every session to your calendar.`,
        `<p>Hi ${esc(order.clientName)},</p><p>You're booked with <strong>${esc(order.consultant.name)}</strong>:</p><ul>${lines.map((l) => `<li>${l}</li>`).join('')}</ul><p>Paid: ${total} · <a href="${receipt}">View receipt</a></p><p>The attached calendar file adds every session to your calendar.</p>`,
        [
          {
            filename: 'consultations.ics',
            content: orderInvite({
              consultantName: order.consultant.name,
              clientName: order.clientName,
              sessions: order.bookings,
            }),
          },
        ],
      );
    } catch (err) {
      // Payment is already confirmed; a failed email must not fail the webhook (Stripe would retry it).
      this.logger.error(
        `Confirmation email for order ${orderId} failed: ${(err as Error).message}`,
      );
    }
  }

  /** Moves an order and all its bookings together, only from the expected status. Returns false if nothing moved. */
  private async setStatus(
    orderId: string,
    to: BookingStatus,
    from: BookingStatus,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.order.updateMany({
        where: { id: orderId, status: from },
        data: { status: to },
      });
      if (count === 0) return false;
      await tx.booking.updateMany({ where: { orderId }, data: { status: to } });
      return true;
    });
  }
}
