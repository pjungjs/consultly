"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch, type Me } from "@/lib/api";

const RESET_DONE = "consultly-demo-reset"; // sessionStorage: show "back to the defaults" once after the reload
const NOTICE_MS = 5000;

function takeResetFlag() {
  try {
    const set = sessionStorage.getItem(RESET_DONE) !== null;
    sessionStorage.removeItem(RESET_DONE);
    return set;
  } catch {
    return false; // storage blocked: just no confirmation line
  }
}

const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

type Role = "client" | "consultant";
const VIEWS: { role: Role; label: string }[] = [
  { role: "client", label: "Client" },
  { role: "consultant", label: "Consultant" },
];

/**
 * A strip under the header for "Try the demo" visitors. The demo is two accounts behind the scenes (a client and
 * their own consultant); here it reads as one demo you view from either side.
 */
export default function DemoBar() {
  const [demo, setDemo] = useState<Me["demo"]>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    let hide: ReturnType<typeof setTimeout> | undefined;
    apiFetch("/me", { credentials: "include", cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<Me>) : null))
      .then((me) => {
        setDemo(me?.demo ?? null);
        // A notice belongs to the page it appeared on: a new page starts clear.
        const justReset = !!me?.demo && takeResetFlag();
        setNotice(justReset ? "Your demo is back to the defaults." : null);
        if (justReset) hide = setTimeout(() => setNotice(null), NOTICE_MS);
      })
      .catch(() => setDemo(null));
    return () => clearTimeout(hide);
  }, [pathname]);

  if (!demo) return null;

  async function viewAs(role: Role) {
    if (role === demo?.role) return;
    setBusy(true);
    const res = await apiFetch("/auth/demo", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, timezone: browserZone() }),
    });
    if (!res.ok) {
      setBusy(false);
      return setNotice((await res.json()).message);
    }
    // A full page load, so the header and every page pick up the new session.
    window.location.assign(role === "consultant" ? "/dashboard" : "/my-bookings");
  }

  async function reset() {
    setBusy(true);
    const res = await apiFetch("/auth/demo/reset", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timezone: browserZone() }),
    });
    if (!res.ok) {
      setBusy(false);
      setConfirming(false);
      return setNotice((await res.json()).message);
    }
    try {
      sessionStorage.setItem(RESET_DONE, "1");
    } catch {}
    window.location.reload();
  }

  return (
    <div className="demo-bar border-b border-rule bg-band">
      <div className="demo-bar-content mx-auto flex max-w-5xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2 text-sm">
        <div className="demo-bar-view flex items-center gap-3">
          <span className="font-medium">Demo</span>
          <span className="text-muted">Viewing as</span>
          <div role="group" aria-label="Viewing as" className="demo-bar-toggle flex rounded-sm border border-ink/30 p-0.5">
            {VIEWS.map(({ role, label }) => (
              <button
                key={role}
                onClick={() => viewAs(role)}
                disabled={busy}
                aria-pressed={demo.role === role}
                className={`rounded-sm px-3 py-0.5 font-medium disabled:opacity-40 ${demo.role === role ? "bg-ink text-paper" : "hover:bg-sheet"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {confirming ? (
          <div className="demo-bar-confirm flex flex-wrap items-center gap-3 sm:ml-auto">
            <span title="Bookings, briefs and profile changes go back to the defaults.">Reset to the defaults?</span>
            <button onClick={() => setConfirming(false)} disabled={busy} className="text-muted hover:text-ink">
              Cancel
            </button>
            <button onClick={reset} disabled={busy} className="rounded-sm bg-ink px-3 py-1 font-medium text-paper disabled:opacity-40">
              {busy ? "Resetting…" : "Reset demo"}
            </button>
          </div>
        ) : (
          <div className="demo-bar-actions flex flex-wrap items-center gap-4 sm:ml-auto">
            {demo.role === "client" && demo.consultantId && (
              <Link href={`/consultants/${demo.consultantId}`} className="underline">
                Book your Demo consultant
              </Link>
            )}
            <button
              onClick={() => {
                setNotice(null);
                setConfirming(true);
              }}
              disabled={busy}
              className="rounded-sm border border-ink/30 px-3 py-1 font-medium hover:bg-sheet disabled:opacity-40"
            >
              Reset demo
            </button>
          </div>
        )}
        {notice && (
          <p role="status" className="demo-bar-notice basis-full text-sm">
            {notice}
          </p>
        )}
      </div>
    </div>
  );
}
