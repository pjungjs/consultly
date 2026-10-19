import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { OrdersService } from './orders.service.js';

const consultant = {
  id: 'c1',
  name: 'Jason Jefferson',
  email: 'jason@consultly.test',
  rateCents: 20000,
  slotMinutes: 60,
  timezone: 'Europe/London',
};
const SLOT_A = '2030-01-07T10:00:00.000Z';
const SLOT_B = '2030-01-07T11:00:00.000Z';

const dto = (over: Record<string, unknown> = {}) => ({
  consultantId: 'c1',
  startsAt: [SLOT_B, SLOT_A],
  clientName: 'Dana',
  clientEmail: 'Dana@Example.com ',
  clientTimezone: 'America/New_York',
  ...over,
});

/** Fakes for everything OrdersService talks to; `$transaction` runs the callback against the same fake. */
function setup() {
  const prisma = {
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    booking: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      count: vi.fn().mockResolvedValue(1), // sessions still booked in the order after a cancel
    },
    brief: { findUnique: vi.fn().mockResolvedValue(null), delete: vi.fn() },
    order: {
      create: vi.fn().mockResolvedValue({ id: 'o1' }),
      update: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
    },
  };
  const consultants = {
    get: vi.fn().mockResolvedValue(consultant),
    slots: vi.fn().mockResolvedValue({ slots: [SLOT_A, SLOT_B] }),
  };
  const stripe = {
    checkout: {
      sessions: {
        create: vi.fn().mockResolvedValue({
          id: 'cs_1',
          url: 'https://checkout.stripe.test/cs_1',
        }),
        retrieve: vi.fn(),
      },
    },
    refunds: { create: vi.fn().mockResolvedValue({ id: 're_1' }) },
  };
  const email = { send: vi.fn().mockResolvedValue(undefined) };
  const service = new OrdersService(
    prisma as never,
    consultants as never,
    { stripe } as never,
    email as never,
  );
  return { service, prisma, consultants, stripe, email };
}

describe('OrdersService.create', () => {
  it('holds every slot in one order and returns the Stripe Checkout URL', async () => {
    const { service, prisma, stripe } = setup();
    await expect(service.create(dto() as never)).resolves.toEqual({
      orderId: 'o1',
      checkoutUrl: 'https://checkout.stripe.test/cs_1',
    });

    const data = prisma.order.create.mock.calls[0][0].data;
    expect(data.amountCents).toBe(40000);
    expect(data.clientEmail).toBe('dana@example.com'); // trimmed and lower-cased
    expect(
      data.bookings.create.map((b: { startsAt: Date }) =>
        b.startsAt.toISOString(),
      ),
    ).toEqual([SLOT_A, SLOT_B]); // sorted
    expect(stripe.checkout.sessions.create.mock.calls[0][0]).toMatchObject({
      metadata: { orderId: 'o1' },
      line_items: [{ quantity: 2 }],
    });
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: { stripeSessionId: 'cs_1' },
    });
  });

  it('rejects a consultant booking their own profile', async () => {
    const { service, prisma } = setup();
    await expect(
      service.create(dto({ clientEmail: 'JASON@consultly.test' }) as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it('rejects a time the schedule does not offer', async () => {
    const { service, consultants, prisma } = setup();
    consultants.slots.mockResolvedValue({ slots: [SLOT_A] });
    await expect(service.create(dto() as never)).rejects.toThrow(
      'One of those times was just taken',
    );
    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it('turns a unique-index clash into 409, so no slot is held', async () => {
    const { service, prisma, stripe } = setup();
    prisma.order.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    await expect(service.create(dto() as never)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('releases the hold when Stripe fails', async () => {
    const { service, prisma, stripe } = setup();
    stripe.checkout.sessions.create.mockRejectedValue(new Error('stripe down'));
    prisma.order.updateMany.mockResolvedValue({ count: 1 });
    await expect(service.create(dto() as never)).rejects.toThrow('stripe down');
    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'o1', status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });
  });
});

describe('OrdersService.markPaid', () => {
  const paidOrder = {
    id: 'o1',
    clientName: 'Dana',
    clientEmail: 'dana@example.com',
    clientTimezone: 'UTC',
    amountCents: 20000,
    consultant: { name: 'Jason Jefferson', timezone: 'Europe/London' },
    bookings: [
      {
        id: 'b1',
        startsAt: new Date(SLOT_A),
        endsAt: new Date(SLOT_B),
        status: 'CONFIRMED',
        amountCents: 20000,
      },
    ],
  };

  it('confirms the order, stores the payment id and emails once', async () => {
    const { service, prisma, email } = setup();
    prisma.order.updateMany.mockResolvedValue({ count: 1 });
    prisma.order.findUnique.mockResolvedValue(paidOrder);
    await service.markPaid('o1', 'pi_1');
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: { stripePaymentId: 'pi_1' },
    });
    expect(email.send).toHaveBeenCalledTimes(1);
    expect(email.send.mock.calls[0][4][0].filename).toBe('consultations.ics');
  });

  it('sends no second email when Stripe delivers the same event again', async () => {
    const { service, prisma, email } = setup();
    prisma.order.updateMany.mockResolvedValue({ count: 0 }); // already CONFIRMED
    prisma.order.findUnique.mockResolvedValue({
      ...paidOrder,
      status: 'CONFIRMED',
    });
    await service.markPaid('o1', 'pi_1');
    expect(email.send).not.toHaveBeenCalled();
  });

  it('does not fail the webhook when the email bounces', async () => {
    const { service, prisma, email } = setup();
    prisma.order.updateMany.mockResolvedValue({ count: 1 });
    prisma.order.findUnique.mockResolvedValue(paidOrder);
    email.send.mockRejectedValue(new Error('resend down'));
    await expect(service.markPaid('o1')).resolves.toBeUndefined();
  });
});

const HOUR = 3_600_000;
const booking = (over: Record<string, unknown> = {}) => ({
  id: 'b1',
  consultantId: 'c1',
  status: 'CONFIRMED',
  startsAt: new Date(Date.now() + 48 * HOUR),
  amountCents: 20000,
  order: {
    stripePaymentId: 'pi_1',
    stripeSessionId: 'cs_1',
    clientEmail: 'dana@example.com',
    clientName: 'Dana',
    clientTimezone: 'UTC',
  },
  consultant: {
    name: 'Jason Jefferson',
    email: 'jason@consultly.test',
    timezone: 'Europe/London',
  },
  ...over,
});

describe('OrdersService.cancelSession', () => {
  it('refunds that one session with an idempotency key and frees the slot', async () => {
    const { service, prisma, stripe, email } = setup();
    prisma.booking.findUnique.mockResolvedValue(booking());
    prisma.booking.findUniqueOrThrow.mockResolvedValue(booking());
    await expect(service.cancelSession('b1', 'c1')).resolves.toEqual({
      cancelled: true,
      refundedCents: 20000,
    });
    expect(stripe.refunds.create).toHaveBeenCalledWith(
      {
        payment_intent: 'pi_1',
        amount: 20000,
        metadata: { bookingId: 'b1', cancelledBy: 'CONSULTANT' },
      },
      { idempotencyKey: 'refund-b1' },
    );
    expect(prisma.booking.update).toHaveBeenCalledWith({
      where: { id: 'b1' },
      data: {
        status: 'CANCELLED',
        refundId: 're_1',
        cancelledBy: 'CONSULTANT',
      },
    });
    // Only the client is told: the consultant is the one who cancelled.
    expect(email.send.mock.calls.map((c) => c[0])).toEqual([
      'dana@example.com',
    ]);
  });

  it("hides another consultant's session behind 404", async () => {
    const { service, prisma, stripe } = setup();
    prisma.booking.findUnique.mockResolvedValue(
      booking({ consultantId: 'someone-else' }),
    );
    await expect(service.cancelSession('b1', 'c1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(stripe.refunds.create).not.toHaveBeenCalled();
  });

  it('refuses sessions that are not booked or already started', async () => {
    const { service, prisma } = setup();
    prisma.booking.findUnique.mockResolvedValue(
      booking({ status: 'CANCELLED' }),
    );
    await expect(service.cancelSession('b1', 'c1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    prisma.booking.findUnique.mockResolvedValue(
      booking({ startsAt: new Date(Date.now() - 60_000) }),
    );
    await expect(service.cancelSession('b1', 'c1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('looks up the payment from the Checkout session for older orders', async () => {
    const { service, prisma, stripe } = setup();
    const old = booking({
      order: { ...booking().order, stripePaymentId: null },
    });
    prisma.booking.findUnique.mockResolvedValue(old);
    prisma.booking.findUniqueOrThrow.mockResolvedValue(old);
    stripe.checkout.sessions.retrieve.mockResolvedValue({
      payment_intent: 'pi_old',
    });
    await service.cancelSession('b1', 'c1');
    expect(stripe.refunds.create.mock.calls[0][0].payment_intent).toBe(
      'pi_old',
    );
  });
});

describe('cancelling the last session in an order', () => {
  it('deletes the brief, since there is nothing left to prepare for', async () => {
    const { service, prisma } = setup();
    prisma.booking.findUnique.mockResolvedValue({
      ...booking(),
      orderId: 'o1',
    });
    prisma.booking.findUniqueOrThrow.mockResolvedValue(booking());
    prisma.booking.count.mockResolvedValue(0);
    prisma.brief.findUnique.mockResolvedValue({
      orderId: 'o1',
      storedPath: 'o1-test.pdf',
    });
    await service.cancelByClient('b1', 'dana@example.com');
    expect(prisma.booking.count).toHaveBeenCalledWith({
      where: { orderId: 'o1', status: 'CONFIRMED' },
    });
    expect(prisma.brief.delete).toHaveBeenCalledWith({
      where: { orderId: 'o1' },
    });
  });

  it('keeps the brief while another session in the order is still booked', async () => {
    const { service, prisma } = setup();
    prisma.booking.findUnique.mockResolvedValue({
      ...booking(),
      orderId: 'o1',
    });
    prisma.booking.findUniqueOrThrow.mockResolvedValue(booking());
    await service.cancelByClient('b1', 'dana@example.com');
    expect(prisma.brief.delete).not.toHaveBeenCalled();
  });
});

describe('OrdersService.cancelByClient', () => {
  it('refunds the session, records the client as canceller, and tells both sides', async () => {
    const { service, prisma, stripe, email } = setup();
    prisma.booking.findUnique.mockResolvedValue(booking());
    prisma.booking.findUniqueOrThrow.mockResolvedValue(booking());
    await expect(
      service.cancelByClient('b1', 'DANA@example.com'),
    ).resolves.toEqual({ cancelled: true, refundedCents: 20000 });
    expect(stripe.refunds.create.mock.calls[0][1]).toEqual({
      idempotencyKey: 'refund-b1',
    });
    expect(prisma.booking.update.mock.calls[0][0].data).toMatchObject({
      status: 'CANCELLED',
      cancelledBy: 'CLIENT',
    });
    expect(email.send.mock.calls.map((c) => c[0])).toEqual([
      'dana@example.com',
      'jason@consultly.test',
    ]);
    expect(email.send.mock.calls[1][1]).toMatch(/^Dana cancelled/);
  });

  it('refuses inside the 24-hour window, without refunding', async () => {
    const { service, prisma, stripe } = setup();
    prisma.booking.findUnique.mockResolvedValue(
      booking({ startsAt: new Date(Date.now() + 23 * HOUR) }),
    );
    await expect(
      service.cancelByClient('b1', 'dana@example.com'),
    ).rejects.toThrow('up to 24 hours before');
    expect(stripe.refunds.create).not.toHaveBeenCalled();
  });

  it("hides someone else's booking behind 404", async () => {
    const { service, prisma } = setup();
    prisma.booking.findUnique.mockResolvedValue(booking());
    await expect(
      service.cancelByClient('b1', 'mallory@example.com'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses a session that is already cancelled', async () => {
    const { service, prisma } = setup();
    prisma.booking.findUnique.mockResolvedValue(
      booking({ status: 'CANCELLED' }),
    );
    await expect(
      service.cancelByClient('b1', 'dana@example.com'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('still cancels when the consultant has no email to notify, or an email bounces', async () => {
    const { service, prisma, email } = setup();
    const noEmail = booking({
      consultant: {
        name: 'Jason Jefferson',
        email: null,
        timezone: 'Europe/London',
      },
    });
    prisma.booking.findUnique.mockResolvedValue(noEmail);
    prisma.booking.findUniqueOrThrow.mockResolvedValue(noEmail);
    email.send.mockRejectedValue(new Error('resend down'));
    await expect(
      service.cancelByClient('b1', 'dana@example.com'),
    ).resolves.toMatchObject({ cancelled: true });
    expect(email.send).toHaveBeenCalledTimes(1);
  });
});
