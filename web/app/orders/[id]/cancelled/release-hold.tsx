"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { api, takeCheckout, type Order } from "@/lib/api";

// Stripe's "back" link lands here: free the held slots now instead of after 30 minutes.
export default function ReleaseHold({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [order, setOrder] = useState<Order | null>(null);

  useEffect(() => {
    takeCheckout(); // released here, so the booking page has nothing left to release
    api<Order>(`/orders/${id}/release`, { method: "POST" }).then(setOrder);
  }, [id]);

  return (
    <div className="release-hold max-w-xl space-y-4">
      <h1 className="font-display text-3xl font-semibold">Payment cancelled</h1>
      <p className="text-muted">You weren&apos;t charged, and the times are open again.</p>
      {order && (
        <Link href={`/consultants/${order.consultantId}`} className="inline-block rounded-sm bg-ink px-5 py-2.5 text-sm font-medium text-paper">
          Pick times with {order.consultant.name}
        </Link>
      )}
    </div>
  );
}
