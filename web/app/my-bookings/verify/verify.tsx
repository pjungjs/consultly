"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { API_URL } from "@/lib/api";

// The emailed link lands here; we trade the one-time token for a session cookie.
export default function Verify() {
  const token = useSearchParams().get("token");
  const router = useRouter();
  const [error, setError] = useState<string | null>(token ? null : "This sign-in link is incomplete.");
  const spent = useRef(false); // React dev mode runs effects twice; the token only works once

  useEffect(() => {
    if (!token || spent.current) return;
    spent.current = true;
    fetch(`${API_URL}/auth/verify`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    }).then(async (res) => {
      if (res.ok) {
        // Consultants land on their dashboard; everyone else on their bookings.
        const me = await fetch(`${API_URL}/me`, { credentials: "include" }).then((r) => r.json());
        return router.replace(me.consultant ? "/dashboard" : "/my-bookings");
      }
      setError((await res.json()).message);
    });
  }, [token, router]);

  if (!error) return <p className="text-muted">Signing you in…</p>;
  return (
    <div className="verify-sign-in max-w-xl space-y-4">
      <h1 className="font-display text-3xl font-semibold">That link didn&apos;t work</h1>
      <p className="text-muted">{error}</p>
      <Link href="/my-bookings" className="inline-block rounded-sm bg-ink px-5 py-2.5 text-sm font-medium text-paper">
        Send a new link
      </Link>
    </div>
  );
}
