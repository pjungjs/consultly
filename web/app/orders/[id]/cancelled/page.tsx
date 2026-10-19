import { Suspense } from "react";
import ReleaseHold from "./release-hold";

export default function CancelledPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="text-muted">Releasing your times…</p>}>
      <ReleaseHold params={params} />
    </Suspense>
  );
}
