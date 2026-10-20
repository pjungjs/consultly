"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { takeCheckout, api, formatPrice, isNotFound, type Order } from "@/lib/api";
import NotFoundMessage from "../../not-found-message";
import BriefPanel from "../../brief-panel";
import { cityFromZone, timeIn } from "@/lib/zone";

const POLL_MS = 1500;
const MAX_POLLS = 20;

// Stripe redirects here right after payment, but the webhook that confirms the order
// can arrive a moment later, so we poll until the status settles.
export default function OrderStatus({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [order, setOrder] = useState<Order | null>(null);
  const [gaveUp, setGaveUp] = useState(false);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    takeCheckout(); // reached Stripe's return page: this checkout is no longer one to release on Back
    let polls = 0;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      let o: Order;
      try {
        o = await api<Order>(`/orders/${id}`);
      } catch (err) {
        if (isNotFound(err)) setMissing(true);
        else setGaveUp(true);
        return;
      }
      setOrder(o);
      if (o.status === "PENDING") {
        if (++polls < MAX_POLLS) timer = setTimeout(load, POLL_MS);
        else setGaveUp(true);
      }
    };
    load();
    return () => clearTimeout(timer);
  }, [id]);

  if (missing) return <NotFoundMessage title="Booking not found" body="This booking link isn't valid. Your bookings are always listed under My bookings." />;
  if (!order) return <p className="text-muted">{gaveUp ? "This booking couldn't be loaded. Refresh to try again." : "Loading your booking…"}</p>;

  if (order.status === "PENDING") {
    return (
      <div className="order-pending max-w-xl space-y-3">
        <h1 className="font-display text-3xl font-semibold">Confirming your payment</h1>
        <p className="text-muted">
          {gaveUp
            ? "Stripe hasn't confirmed this payment yet. Refresh in a minute; your times stay held while we wait."
            : "This usually takes a few seconds."}
        </p>
      </div>
    );
  }

  if (order.status === "CANCELLED") {
    return (
      <div className="order-cancelled max-w-xl space-y-4">
        <h1 className="font-display text-3xl font-semibold">This booking was cancelled</h1>
        <p className="text-muted">No payment was taken. The times are open for booking again.</p>
        <Link href={`/consultants/${order.consultantId}`} className="inline-block rounded-sm bg-ink px-5 py-2.5 text-sm font-medium text-paper">
          Pick other times
        </Link>
      </div>
    );
  }

  const city = cityFromZone(order.consultant.timezone);
  const count = order.bookings.length;

  return (
    <div className="order-confirmed max-w-2xl space-y-8">
      <div>
        <p className="inline-block rounded-sm bg-highlight px-2 py-0.5 text-sm font-medium text-on-highlight">{order.amountCents === 0 ? "Booked" : "Paid and booked"}</p>
        <h1 className="mt-4 font-serif text-5xl leading-tight">
          You&apos;re seeing {order.consultant.name} {count === 1 ? "once" : `${count} times`}
        </h1>
      </div>
      <ul className="order-sessions divide-y divide-rule border-y border-rule">
        {order.bookings.map((b) => (
          <li key={b.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
            <span className={`font-medium ${b.status === "CANCELLED" ? "text-muted line-through" : ""}`}>
              {new Date(b.startsAt).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}, {timeIn(b.startsAt)}
            </span>
            <span className="text-sm text-muted">
              {b.status === "CANCELLED"
                ? `Cancelled by ${b.cancelledBy === "CLIENT" ? "you" : order.consultant.name} · ${formatPrice(b.amountCents ?? 0)} refunded`
                : `${timeIn(b.startsAt, order.consultant.timezone)} in ${city}`}
            </span>
          </li>
        ))}
      </ul>
      <dl className="order-summary grid gap-x-8 gap-y-3 sm:grid-cols-[10rem_1fr]">
        <dt className="text-muted">{order.amountCents === 0 ? "Price" : "Paid"}</dt>
        <dd>{formatPrice(order.amountCents)}</dd>
        <dt className="text-muted">Confirmation sent to</dt>
        <dd>{order.clientEmail}</dd>
      </dl>
      <div className="flex flex-wrap gap-3">
        {/* Calendar sync (Google etc.) is a later feature; until then, everything lives in My bookings. */}
        <Link href="/my-bookings" className="rounded-sm bg-ink px-5 py-2.5 text-sm font-medium text-paper">
          View in My bookings
        </Link>
        <Link href="/consultants" className="px-2 py-2.5 text-sm text-muted hover:text-ink">
          Back to consultants
        </Link>
      </div>
      <BriefPanel orderId={order.id} />
    </div>
  );
}
