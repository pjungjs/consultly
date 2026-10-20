import { Suspense } from "react";
import OrderStatus from "./order-status";
import LoadingNote from "../../loading-note";

export default function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<LoadingNote label="Loading your booking…" />}>
      <OrderStatus params={params} />
    </Suspense>
  );
}
