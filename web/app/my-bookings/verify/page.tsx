import { Suspense } from "react";
import Verify from "./verify";

export default function VerifyPage() {
  return (
    <Suspense fallback={<p className="text-muted">Signing you in…</p>}>
      <Verify />
    </Suspense>
  );
}
