import { Suspense } from "react";
import OrderStatus from "./order-status";

export default function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="text-muted">Loading your booking…</p>}>
      <OrderStatus params={params} />
    </Suspense>
  );
}
