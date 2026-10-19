"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  apiFetch,
  formatPrice,
  type Dashboard,
  type DashboardSession,
} from "@/lib/api";
import { cityFromZone, timeIn } from "@/lib/zone";
import { dayKey, keyLabel } from "@/lib/calendar";
import BriefView from "../brief-view";
import SessionCalendar from "../session-calendar";
import AvailabilityEditor from "./availability-editor";

type State =
  | { kind: "loading" }
  | { kind: "signed-out" }
  | { kind: "not-consultant" }
  | { kind: "ready"; data: Dashboard; loadedAt: number };

async function fetchDashboard(): Promise<State> {
  const res = await apiFetch(`/me/consultant/dashboard`, {
    credentials: "include",
    cache: "no-store",
  });
  if (res.status === 401) return { kind: "signed-out" };
  if (res.status === 403) return { kind: "not-consultant" };
  return { kind: "ready", data: await res.json(), loadedAt: Date.now() };
}

// Stats, a week/month calendar, then sessions by day under Upcoming / Past tabs.
export default function ConsultantDashboard() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [day, setDay] = useState<string | null>(null); // a clicked calendar day narrows the list
  const [notice, setNotice] = useState<string | null>(null);
  // "?tab=availability" (e.g. from Profile's "Set weekly hours") opens that tab. The first render is "Loading…"
  // on server and client alike, so reading the URL here can't cause a hydration mismatch.
  const [tab, setTab] = useState<"sessions" | "availability">(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tab") === "availability" ? "availability" : "sessions",
  );
  const [list, setList] = useState<"upcoming" | "past">("upcoming");

  useEffect(() => {
    fetchDashboard().then(setState);
  }, []);

  async function onCancelled(message: string) {
    setNotice(message);
    setState(await fetchDashboard());
  }

  if (state.kind === "loading") return <p className="text-muted">Loading…</p>;

  if (state.kind === "signed-out" || state.kind === "not-consultant") {
    return (
      <div className="dashboard-signed-out max-w-xl space-y-4">
        <h1 className="font-display text-4xl font-semibold tracking-tight">
          Consultant dashboard
        </h1>
        <p className="text-muted">
          {state.kind === "signed-out"
            ? "Sign in with the email on your consultant profile to see your sessions and earnings."
            : "You're signed in, but this email isn't linked to a consultant profile."}
        </p>
        <Link
          href="/my-bookings"
          className="inline-block rounded-sm bg-ink px-5 py-2.5 text-sm font-medium text-paper"
        >
          {state.kind === "signed-out" ? "Sign in" : "Go to my bookings"}
        </Link>
      </div>
    );
  }

  const { consultant, stats, upcoming, past } = state.data;
  const zone = consultant.timezone;
  const all = [...past].reverse().concat(upcoming); // oldest first
  const listed = day ? all.filter((s) => dayKey(s.startsAt, zone) === day) : list === "upcoming" ? upcoming : past;
  const days = groupByDay(listed, zone);
  const canCancel = (s: DashboardSession) => s.status === "CONFIRMED" && new Date(s.startsAt).getTime() > state.loadedAt;

  return (
    <div className="dashboard space-y-10">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-serif text-5xl leading-none">{consultant.name}</h1>
        <Link
          href={`/consultants/${consultant.id}`}
          className="text-sm underline"
        >
          View your public profile
        </Link>
      </div>

      {consultant.status !== "live" && (
        <p role="status" className="dashboard-listing-notice rounded-sm border border-highlight px-4 py-3 text-sm">
          {consultant.status === "needs-hours" ? (
            <>
              Clients can&apos;t find you yet: set your weekly hours in{" "}
              <button onClick={() => setTab("availability")} className="font-medium underline">
                Availability
              </button>{" "}
              to go live.
            </>
          ) : (
            <>
              Your profile is paused, so clients can&apos;t find or book you. Existing sessions are kept.{" "}
              <Link href="/profile" className="font-medium underline">
                Resume on Profile
              </Link>
            </>
          )}
        </p>
      )}

      <dl className="dashboard-stats grid grid-cols-3 divide-x divide-rule border-y border-rule">
        <Stat
          label="Booked this week"
          value={formatPrice(stats.thisWeekCents)}
        />
        <Stat label="Upcoming sessions" value={String(stats.upcomingCount)} />
        <Stat label="Earned all time" value={formatPrice(stats.earnedCents)} />
      </dl>

      <div
        role="tablist"
        aria-label="Dashboard sections"
        className="dashboard-tabs flex gap-1 border-b border-rule"
      >
        {(["sessions", "availability"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-4 py-2 font-medium ${tab === t ? "border-ink" : "border-transparent text-muted hover:text-ink"}`}
          >
            {t === "sessions" ? "Sessions" : "Availability"}
          </button>
        ))}
      </div>

      {tab === "availability" ? (
        <AvailabilityEditor
          onChanged={async () => setState(await fetchDashboard())}
        />
      ) : (
        <>
          {notice && (
            <p role="status" className="rounded-sm bg-sheet px-4 py-3 text-sm">
              {notice}
            </p>
          )}

          <SessionCalendar
            sessions={all.filter((s) => s.status === "CONFIRMED")}
            zone={zone}
            now={state.loadedAt}
            selected={day}
            onSelect={setDay}
            describe={(s) => s.order.clientName}
          />

          <section className="dashboard-sessions space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              {day ? (
                <h2 className="font-display text-2xl font-semibold">
                  Sessions on {keyLabel(day, { weekday: "long", month: "long", day: "numeric" })}
                </h2>
              ) : (
                <div role="tablist" aria-label="Sessions" className="dashboard-session-tabs flex gap-1 border-b border-rule">
                  {(["upcoming", "past"] as const).map((t) => (
                    <button
                      key={t}
                      role="tab"
                      aria-selected={list === t}
                      onClick={() => setList(t)}
                      className={`-mb-px border-b-2 px-3 py-1.5 font-display text-lg font-semibold ${list === t ? "border-ink" : "border-transparent text-muted hover:text-ink"}`}
                    >
                      {t === "upcoming" ? `Upcoming (${upcoming.length})` : `Past (${past.length})`}
                    </button>
                  ))}
                </div>
              )}
              {day ? (
                <button onClick={() => setDay(null)} className="text-sm underline">
                  Show all sessions
                </button>
              ) : (
                <p className="text-sm text-muted">Times in your zone, {cityFromZone(zone)}</p>
              )}
            </div>
            {days.length === 0 ? (
              <p className="text-muted">
                {list === "past" ? "No past sessions yet." : "No upcoming sessions. Share your profile link so clients can book you."}
              </p>
            ) : (
              <div className="space-y-6">
                {days.map(([label, sessions]) => (
                  <div key={label} className="grid gap-2 sm:grid-cols-[9rem_1fr]">
                    <p className="pt-3 font-medium">{label}</p>
                    <ul className="dashboard-day-sessions divide-y divide-rule border-y border-rule">
                      {sessions.map((s) => (
                        <SessionRow key={s.id} s={s} zone={zone} onCancelled={canCancel(s) ? onCancelled : undefined} />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="dashboard-stat px-4 py-5 first:pl-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 font-serif text-3xl">{value}</dd>
    </div>
  );
}

function SessionRow({
  s,
  zone,
  showDate,
  onCancelled,
}: {
  s: DashboardSession;
  zone: string;
  showDate?: boolean;
  onCancelled?: (message: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [showBrief, setShowBrief] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const theirs = s.order.clientTimezone !== zone;

  // Two-step confirm in the page itself (no browser dialog), then refund through the API.
  async function cancel() {
    setBusy(true);
    setError(null);
    const res = await apiFetch(`/me/consultant/bookings/${s.id}/cancel`,
      { method: "POST", credentials: "include" },
    );
    const body = await res.json();
    setBusy(false);
    if (!res.ok) return setError(body.message);
    setConfirming(false);
    onCancelled?.(
      `Cancelled ${s.order.clientName}'s session${s.amountCents === 0 ? "" : ` and refunded ${formatPrice(body.refundedCents)}`}. They've been emailed.`,
    );
  }

  const cancelled = s.status === "CANCELLED";

  return (
    <li className="dashboard-session space-y-2 py-3">
      <div className="grid gap-1 sm:grid-cols-[6rem_1fr_auto] sm:items-baseline sm:gap-4">
        <span className={`font-semibold ${cancelled ? "text-muted line-through" : ""}`}>
          {showDate &&
            `${new Date(s.startsAt).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: zone })} `}
          {timeIn(s.startsAt, zone)}
        </span>
        <span>
          {s.order.clientName}{" "}
          <a
            href={`mailto:${s.order.clientEmail}`}
            className="text-sm text-muted underline"
          >
            {s.order.clientEmail}
          </a>
        </span>
        <span className="flex items-baseline gap-3 text-sm text-muted">
          {theirs
            ? `${timeIn(s.startsAt, s.order.clientTimezone)} for them · `
            : ""}
          {cancelled ? (
            // Cancelled sessions stay listed so the consultant sees what changed, like the client does.
            <span className="font-medium text-red-700 dark:text-red-400">
              {s.cancelledBy === "CLIENT" ? "Cancelled by client" : "Cancelled by you"}
              {s.amountCents > 0 && ` · ${formatPrice(s.amountCents)} refunded`}
            </span>
          ) : (
            formatPrice(s.amountCents)
          )}
          {s.order.brief && !cancelled && (
            <button onClick={() => setShowBrief(!showBrief)} aria-expanded={showBrief} className="font-medium text-ink underline">
              {showBrief ? "Hide brief" : "Brief"}
            </button>
          )}
          {onCancelled && !confirming && (
            <button
              onClick={() => setConfirming(true)}
              className="text-ink underline"
            >
              Cancel
            </button>
          )}
        </span>
      </div>
      {showBrief && (
        <div className="dashboard-session-brief rounded-sm bg-sheet px-4 py-4">
          <BriefView orderId={s.order.id} />
        </div>
      )}
      {confirming && (
        <div className="dashboard-cancel-confirm flex flex-wrap items-center justify-between gap-3 rounded-sm bg-sheet px-3 py-2 text-sm">
          <span>
            {s.amountCents === 0
              ? `Cancel this free session with ${s.order.clientName}?`
              : `Cancel this session and refund ${formatPrice(s.amountCents)} to ${s.order.clientName}?`}
          </span>
          <span className="flex items-center gap-3">
            <button
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="text-muted hover:text-ink"
            >
              Keep session
            </button>
            <button
              onClick={cancel}
              disabled={busy}
              className="rounded-sm bg-ink px-3 py-1.5 font-medium text-paper disabled:opacity-40"
            >
              {busy
                ? "Refunding…"
                : s.amountCents === 0
                  ? "Cancel session"
                  : `Cancel & refund ${formatPrice(s.amountCents)}`}
            </button>
          </span>
          {error && (
            <span
              role="alert"
              className="basis-full text-red-700 dark:text-red-400"
            >
              {error}
            </span>
          )}
        </div>
      )}
    </li>
  );
}

function groupByDay(
  sessions: DashboardSession[],
  zone: string,
): [string, DashboardSession[]][] {
  const byDay = new Map<string, DashboardSession[]>();
  for (const s of sessions) {
    const label = new Date(s.startsAt).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: zone,
    });
    byDay.set(label, [...(byDay.get(label) ?? []), s]);
  }
  return [...byDay.entries()];
}
