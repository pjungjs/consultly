"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

/**
 * On the deployed portfolio site email only reaches the owner, so visitors explore through private demo accounts:
 * a client and their own copy of consultant Jason Jefferson, which nobody else sees.
 * Shown only when the API has demo sign-in turned on.
 */
export default function DemoSignIn() {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState<"client" | "consultant" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch(`/auth/demo`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { enabled: false }))
      .then((body) => setEnabled(body.enabled))
      .catch(() => setEnabled(false));
  }, []);

  async function start(role: "client" | "consultant") {
    setBusy(role);
    setError(null);
    const res = await apiFetch(`/auth/demo`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
    });
    if (!res.ok) {
      setBusy(null);
      return setError("The demo isn't available right now.");
    }
    // A full page load, so the header and every page pick up the new session.
    window.location.href = role === "consultant" ? "/dashboard" : "/my-bookings";
  }

  if (!enabled) return null;
  return (
    <section className="demo-sign-in space-y-3 rounded-sm border border-rule bg-sheet px-5 py-5">
      <h2 className="font-display text-xl font-semibold">Just looking around?</h2>
      <p className="text-sm text-muted">
        Try Consultly without an email: a private demo you can view as a client or as consultant Jason Jefferson, with a few
        sessions already booked. Nobody else sees what you do, and you can reset it any time. Payments use Stripe&apos;s test card 4242 4242 4242 4242.
      </p>
      <div className="flex flex-wrap gap-3">
        <button onClick={() => start("client")} disabled={busy !== null} className="rounded-sm bg-ink px-4 py-2 text-sm font-medium text-paper disabled:opacity-40">
          {busy === "client" ? "Signing in…" : "Explore as a client"}
        </button>
        <button onClick={() => start("consultant")} disabled={busy !== null} className="rounded-sm border border-rule px-4 py-2 text-sm font-medium hover:bg-paper disabled:opacity-40">
          {busy === "consultant" ? "Signing in…" : "Explore as a consultant"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </section>
  );
}
