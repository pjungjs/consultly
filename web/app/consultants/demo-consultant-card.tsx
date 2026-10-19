"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch, type Me } from "@/lib/api";

/** For "Try the demo" visitors: their private copy of Jason isn't in the public list, so it's pinned here. */
export default function DemoConsultantCard() {
  const [consultantId, setConsultantId] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/me", { credentials: "include", cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<Me>) : null))
      .then((me) => setConsultantId(me?.demo?.consultantId ?? null))
      .catch(() => setConsultantId(null));
  }, []);

  if (!consultantId) return null;
  return (
    <section className="demo-consultant-card flex flex-wrap items-center justify-between gap-3 rounded-sm border border-rule bg-sheet px-5 py-4">
      <div>
        <h2 className="font-medium">Your Demo consultant: Jason Jefferson</h2>
        <p className="text-sm text-muted">Part of your private demo. Only you can see and book this Jason.</p>
      </div>
      <Link href={`/consultants/${consultantId}`} className="rounded-sm bg-ink px-4 py-2 text-sm font-medium text-paper">
        See times
      </Link>
    </section>
  );
}
