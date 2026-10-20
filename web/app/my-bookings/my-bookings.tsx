"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { accountLabel, apiFetch, CLIENT_CANCEL_HOURS, formatPrice, type Order } from "@/lib/api";
import { cityFromZone, timeIn } from "@/lib/zone";
import { dayKey, keyLabel } from "@/lib/calendar";
import SessionCalendar from "../session-calendar";
import DemoSignIn from "./demo-sign-in";
import LoadingNote from "../loading-note";

type State =
  | { kind: "loading" }
  | { kind: "signed-out"; sent?: string; error?: string; devLink?: string; devReason?: string }
  | { kind: "signed-in"; email: string; orders: Order[]; loadedAt: number };

async function fetchMine(): Promise<State> {
  const res = await apiFetch(`/me/orders`, { credentials: "include", cache: "no-store" });
  if (res.status === 401) return { kind: "signed-out" };
  const body = await res.json();
  return { kind: "signed-in", email: body.email, orders: body.orders, loadedAt: Date.now() };
}

// The session lives in an httpOnly cookie, so every call sends credentials.
export default function MyBookings() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [day, setDay] = useState<string | null>(null); // a clicked calendar day narrows the list
  const [list, setList] = useState<"upcoming" | "past">("upcoming");
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    fetchMine().then(setState);
  }, []);

  async function requestLink(form: FormData) {
    const email = String(form.get("email"));
    const res = await apiFetch(`/auth/magic-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (res.ok) return setState({ kind: "signed-out", sent: email });
    const body = await res.json();
    // A failed send is shown, never hidden behind "check your inbox". devLink only exists outside production.
    setState({
      kind: "signed-out",
      error: res.status === 400 ? "Enter a valid email address." : body.message,
      devLink: body.devLink,
      devReason: body.devReason,
    });
  }

  async function signOut() {
    await apiFetch(`/auth/logout`, { method: "POST", credentials: "include" });
    setState({ kind: "signed-out" });
  }

  if (state.kind === "loading") return <LoadingNote />;

  if (state.kind === "signed-out") {
    return (
      <div className="my-bookings-signed-out max-w-xl space-y-6">
        <h1 className="font-display text-4xl font-semibold tracking-tight">My bookings</h1>
        {state.sent ? (
          <p>
            Check <span className="font-medium">{state.sent}</span> for a sign-in link.<br />It works once and expires in 15 minutes.
          </p>
        ) : (
          <>
            <p className="text-muted">Enter the email you paid with and we&apos;ll send you a sign-in link.<br />No password needed.</p>
            <form action={requestLink} className="my-bookings-sign-in-form flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-sm">
                Email
                <input name="email" type="email" required autoComplete="email" className="w-72 rounded-sm border border-rule bg-sheet px-3 py-2" />
              </label>
              <button className="rounded-sm bg-ink px-5 py-2.5 text-sm font-medium text-paper">Email me a link</button>
            </form>
            {state.error && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{state.error}</p>}
            {state.devLink && (
              <div className="space-y-1 rounded-sm border border-dashed border-rule px-4 py-3 text-sm">
                <p className="font-medium">Dev mode: the email couldn&apos;t be sent, so here is the link.</p>
                <p className="text-muted">{state.devReason}</p>
                <a href={state.devLink} className="underline">
                  Open sign-in link
                </a>
              </div>
            )}
          </>
        )}
        {!state.sent && <DemoSignIn />}
      </div>
    );
  }

  const now = state.loadedAt; // captured at fetch time so rendering stays pure
  const sessions = state.orders
    .flatMap((o) => o.bookings.map((b) => ({ ...b, order: o })))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const isOver = (s: Session) => new Date(s.endsAt).getTime() <= now;
  // Same as the consultant's dashboard: a cancelled session stays listed until its time, then drops off.
  // Past means sessions that took place.
  const listed = sessions.filter((s) => !(isOver(s) && s.status === "CANCELLED"));
  const upcoming = listed.filter((s) => !isOver(s));
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const past = listed.filter(isOver).reverse(); // newest first
  const shown = day ? listed.filter((s) => dayKey(s.startsAt, zone) === day) : list === "upcoming" ? upcoming : past;

  return (
    <div className="my-bookings space-y-10">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-4xl font-semibold tracking-tight">My bookings</h1>
        <p className="text-sm text-muted">
          Signed in as {accountLabel(state.email)} ·{" "}
          <button onClick={signOut} className="underline hover:text-ink">
            Sign out
          </button>
        </p>
      </div>
      {sessions.length === 0 ? (
        <p className="text-muted">
          No paid bookings for this email yet. <Link href="/consultants" className="text-ink underline">Find a consultant</Link>
        </p>
      ) : (
        <>
          <SessionCalendar
            sessions={sessions.filter((s) => s.status !== "CANCELLED")}
            zone={zone}
            now={now}
            selected={day}
            onSelect={setDay}
            describe={(s) => s.order.consultant.name}
          />
          <div className="my-bookings-sessions space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              {day ? (
                <h2 className="font-display text-xl font-semibold">On {keyLabel(day, { weekday: "long", month: "long", day: "numeric" })}</h2>
              ) : (
                <div role="tablist" aria-label="Bookings" className="my-bookings-tabs flex gap-1 border-b border-rule">
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
              {day && (
                <button onClick={() => setDay(null)} className="text-sm underline">
                  Show all bookings
                </button>
              )}
            </div>
            {notice && (
              <p role="status" className="rounded-sm bg-sheet px-4 py-3 text-sm">
                {notice}
              </p>
            )}
            <SessionList
              sessions={shown}
              now={now}
              onCancelled={async (message) => {
                setNotice(message);
                setState(await fetchMine());
              }}
              empty={day ? "Nothing that day." : list === "upcoming" ? "Nothing coming up." : "No past sessions yet."}
            />
          </div>
        </>
      )}
    </div>
  );
}

type Session = Order["bookings"][number] & { order: Order };

function SessionList({ sessions, empty, now, onCancelled }: { sessions: Session[]; empty: string; now: number; onCancelled: (message: string) => void }) {
  if (sessions.length === 0) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="my-bookings-list divide-y divide-rule border-y border-rule">
      {sessions.map((s) => (
        <SessionRow key={s.id} s={s} now={now} onCancelled={onCancelled} />
      ))}
    </ul>
  );
}

function SessionRow({ s, now, onCancelled }: { s: Session; now: number; onCancelled: (message: string) => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelled = s.status === "CANCELLED";
  const startsIn = new Date(s.startsAt).getTime() - now;
  const upcoming = startsIn > 0 && !cancelled;
  const canCancel = upcoming && startsIn > CLIENT_CANCEL_HOURS * 3_600_000;
  const price = formatPrice(s.amountCents ?? 0);
  const free = (s.amountCents ?? 0) === 0;

  // Same two-step confirm as the consultant's cancel: no browser dialog, the refund happens on the second click.
  async function cancel() {
    setBusy(true);
    setError(null);
    const res = await apiFetch(`/me/bookings/${s.id}/cancel`, { method: "POST", credentials: "include" });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) return setError(body.message);
    setConfirming(false);
    onCancelled(
      `Cancelled your session with ${s.order.consultant.name}${free ? "" : ` and refunded ${formatPrice(body.refundedCents)}`}. A confirmation is on its way to your inbox.`,
    );
  }

  return (
    <li className="my-bookings-session space-y-2 py-3">
      <div className="grid gap-1 sm:grid-cols-[1fr_auto] sm:items-baseline">
        <div>
          <p className={`font-medium ${cancelled ? "text-muted line-through" : ""}`}>
            {new Date(s.startsAt).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}, {timeIn(s.startsAt)}
          </p>
          <p className="text-sm text-muted">
            with {s.order.consultant.name} · {timeIn(s.startsAt, s.order.consultant.timezone)} in {cityFromZone(s.order.consultant.timezone)}
          </p>
        </div>
        <div className="flex flex-wrap items-baseline gap-4 text-sm">
          {cancelled ? (
            <span className="font-medium text-red-700 dark:text-red-400">
              {s.cancelledBy === "CLIENT" ? "Cancelled by you" : "Cancelled by consultant"}
              {!free && ` · ${price} refunded`}
            </span>
          ) : (
            <span className="text-muted">{price}</span>
          )}
          <Link href={`/orders/${s.order.id}`} className="underline">
            Receipt
          </Link>
          {!cancelled && (s.order.brief || upcoming) && (
            <Link href={`/orders/${s.order.id}#brief`} className="underline">
              {s.order.brief ? "Brief" : "Add a brief"}
            </Link>
          )}
          {canCancel && !confirming && (
            <button onClick={() => setConfirming(true)} className="underline">
              Cancel
            </button>
          )}
          {upcoming && !canCancel && <span className="text-muted">Within {CLIENT_CANCEL_HOURS} hours: contact your consultant to cancel</span>}
        </div>
      </div>
      {confirming && !cancelled && (
        <div className="my-bookings-cancel-confirm flex flex-wrap items-center justify-between gap-3 rounded-sm bg-sheet px-3 py-2 text-sm">
          <span>{free ? "Cancel this free session?" : <>Cancel this session? You&apos;ll get {price} back.</>}</span>
          <span className="flex items-center gap-3">
            <button onClick={() => setConfirming(false)} disabled={busy} className="text-muted hover:text-ink">
              Keep session
            </button>
            <button onClick={cancel} disabled={busy} className="rounded-sm bg-ink px-3 py-1.5 font-medium text-paper disabled:opacity-40">
              {busy ? "Cancelling…" : free ? "Cancel session" : `Cancel & refund ${price}`}
            </button>
          </span>
          {error && (
            <span role="alert" className="basis-full text-red-700 dark:text-red-400">
              {error}
            </span>
          )}
        </div>
      )}
    </li>
  );
}
