"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { API_URL, CLIENT_CANCEL_HOURS, formatPrice, type Consultant, type Me } from "@/lib/api";
import { buildWeeks, dayKey, keyLabel, monthCells, shiftMonth, type Day } from "@/lib/calendar";
import CalendarToolbar, { type CalendarView } from "../../calendar-toolbar";
import { cityFromZone, timeIn } from "@/lib/zone";

const MAX_SESSIONS = 6; // matches the API's MAX_SESSIONS_PER_ORDER
const BOOKING_WINDOW_DAYS = 60; // matches the API's slot window

const weekRangeLabel = (week: Day[]) => {
  const first = week[0].date;
  const last = week[6].date;
  const fmt = (d: Date, withMonth: boolean) => d.toLocaleDateString(undefined, withMonth ? { month: "short", day: "numeric" } : { day: "numeric" });
  return `${fmt(first, true)} – ${fmt(last, first.getMonth() !== last.getMonth())}`;
};

// Runs in the browser, so "your time" is the visitor's own timezone.
export default function SlotPicker({
  consultant,
  slots,
}: {
  consultant: Consultant;
  slots: string[];
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [step, setStep] = useState<"pick" | "details">("pick");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [loadedAt] = useState(() => Date.now());
  const [weekIndex, setWeekIndex] = useState<number | null>(null); // null = first week with open times
  const [view, setView] = useState<CalendarView>("week");
  const [month, setMonth] = useState<{ y: number; m: number } | null>(null); // null = this month
  const [pickedDay, setPickedDay] = useState<string | null>(null); // month view: whose times are listed
  // Consultants can't book themselves; the API enforces it, this just explains it up front.
  const isOwnProfile = me?.consultant?.id === consultant.id;

  // Signed-in clients get their email filled and locked, and their last-used name prefilled.
  useEffect(() => {
    fetch(`${API_URL}/me`, { credentials: "include", cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<Me>) : null))
      .then(setMe)
      .catch(() => {});
  }, []);

  function toggle(iso: string) {
    setError(null);
    setSelected((cur) => {
      if (cur.includes(iso)) return cur.filter((s) => s !== iso);
      if (cur.length >= MAX_SESSIONS) {
        setError(`You can book up to ${MAX_SESSIONS} sessions at once.`);
        return cur;
      }
      return [...cur, iso].sort();
    });
  }

  // Hold every chosen slot in one order, then hand the client to Stripe Checkout.
  async function book(form: FormData) {
    if (selected.length === 0) return;
    setSubmitting(true);
    setError(null);
    const res = await fetch(`${API_URL}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        consultantId: consultant.id,
        startsAt: selected,
        clientName: form.get("name"),
        clientEmail: form.get("email"),
        // The time zone from their profile, else this browser's; used for times in their emails.
        clientTimezone: me?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    });
    const body = await res.json();
    if (res.ok) {
      window.location.href = body.checkoutUrl;
      return;
    }
    setSubmitting(false);
    setError(
      Array.isArray(body.message) ? body.message.join(", ") : body.message,
    );
    if (res.status === 409) {
      setSelected([]);
      setStep("pick");
      router.refresh(); // reload slots so taken times disappear
    }
  }

  const visitorZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const city = cityFromZone(consultant.timezone);
  const sameZone =
    timeIn(slots[0] ?? new Date(), visitorZone) ===
    timeIn(slots[0] ?? new Date(), consultant.timezone);
  const total = formatPrice(consultant.rateCents * selected.length);
  // Sessions this close can't be cancelled online for a refund, so say so before the client pays.
  const lastMinute = selected.filter((iso) => new Date(iso).getTime() - loadedAt <= CLIENT_CANCEL_HOURS * 3_600_000);

  // Sunday-to-Saturday weeks in your timezone across the whole booking window.
  // Columns are your days; each slot also shows the consultant's local time.
  const weeks = useMemo(() => buildWeeks(slots, loadedAt, BOOKING_WINDOW_DAYS), [slots, loadedAt]);
  const today = dayKey(loadedAt);
  const slotsByDay = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const iso of slots) map.set(dayKey(iso), [...(map.get(dayKey(iso)) ?? []), iso]);
    return map;
  }, [slots]);
  const firstOpenWeek = Math.max(0, weeks.findIndex((w) => w.some((day) => day.isos.length > 0)));
  const shownWeek = Math.min(weekIndex ?? firstOpenWeek, weeks.length - 1);
  const thisMonth = { y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) };
  const lastKey = slots.length ? dayKey(slots[slots.length - 1]) : today;
  const lastMonth = { y: Number(lastKey.slice(0, 4)), m: Number(lastKey.slice(5, 7)) };
  const shownMonth = month ?? thisMonth;
  const monthIndex = (x: { y: number; m: number }) => x.y * 12 + x.m;
  const firstOpenIn = (mo: { y: number; m: number }) =>
    [...slotsByDay.keys()].find((k) => k.startsWith(`${mo.y}-${String(mo.m).padStart(2, "0")}`)) ?? null;
  const shownDay = pickedDay ?? firstOpenIn(shownMonth);

  function goToday() {
    setWeekIndex(0);
    setMonth(thisMonth);
    setPickedDay(slotsByDay.has(today) ? today : null);
  }

  function changeMonth(delta: number) {
    setMonth(shiftMonth(shownMonth, delta));
    setPickedDay(null);
  }

  const slotButton = (iso: string) => {
    const on = selected.includes(iso);
    return (
      <button
        key={iso}
        onClick={() => toggle(iso)}
        disabled={step === "details"}
        aria-pressed={on}
        className={`slot-picker-slot rounded-sm px-2 py-1.5 text-left transition-colors disabled:cursor-not-allowed ${
          on ? "bg-highlight text-on-highlight" : "bg-sheet hover:bg-rule/60"
        }`}
      >
        <span className="block text-sm font-semibold">{timeIn(iso)}</span>
        {!sameZone && (
          <span className={`block text-xs ${on ? "text-on-highlight/70" : "text-muted"}`}>{timeIn(iso, consultant.timezone)}</span>
        )}
      </button>
    );
  };

  if (slots.length === 0) {
    return (
      <p className="slot-picker-empty text-muted">
        {consultant.name} has no open hours in the next 60 days. Check back
        soon.
      </p>
    );
  }

  return (
    <section className="slot-picker space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule pb-3">
        <div>
          <h2 className="font-display text-2xl font-semibold">
            Pick your times
          </h2>
          <p className="text-sm text-muted">
            Choose one session or several, then pay once.
          </p>
        </div>
        <p className="text-sm">
          <span className="font-medium">
            Your time ({cityFromZone(visitorZone)})
          </span>
          {!sameZone && (
            <span className="text-muted"> · {city} time in grey</span>
          )}
        </p>
      </div>
      <CalendarToolbar
        view={view}
        onView={(v) => {
          setView(v);
          setPickedDay(null);
        }}
        label={
          view === "week"
            ? weekRangeLabel(weeks[shownWeek])
            : keyLabel(`${shownMonth.y}-${String(shownMonth.m).padStart(2, "0")}-01`, { month: "long", year: "numeric" })
        }
        onPrev={() => (view === "week" ? setWeekIndex(shownWeek - 1) : changeMonth(-1))}
        onNext={() => (view === "week" ? setWeekIndex(shownWeek + 1) : changeMonth(1))}
        prevDisabled={view === "week" ? shownWeek === 0 : monthIndex(shownMonth) <= monthIndex(thisMonth)}
        nextDisabled={view === "week" ? shownWeek >= weeks.length - 1 : monthIndex(shownMonth) >= monthIndex(lastMonth)}
        onToday={goToday}
      />
      {view === "week" ? (
        <div className="pb-2 sm:overflow-x-auto">
          {/* Phones: one day per row. Wider screens: seven columns, scrolling sideways if needed. */}
          <div className="slot-picker-week grid gap-4 sm:min-w-[52rem] sm:grid-cols-7 sm:gap-3">
            {weeks[shownWeek].map(({ date, state, isos }) => (
              <div
                key={date.toISOString()}
                className={`slot-picker-day grid-cols-[3.5rem_1fr] gap-3 sm:block ${state === "past" ? "hidden" : "grid"} ${state === "open" ? "" : "opacity-40"}`}
              >
                <div className="sm:mb-2 sm:border-b sm:border-rule sm:pb-2">
                  <p className="text-sm text-muted">{date.toLocaleDateString(undefined, { weekday: "short" })}</p>
                  <p className={`font-display text-xl font-semibold ${dayKey(date) === today ? "underline underline-offset-4" : ""}`}>
                    {date.getDate()}
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-1.5 sm:flex sm:flex-col">
                  {isos.length === 0 && (
                    <p className="col-span-3 py-1.5 text-sm text-muted">
                      {state === "past" ? "Past" : state === "later" ? "Not open yet" : "No times"}
                    </p>
                  )}
                  {isos.map(slotButton)}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="slot-picker-month space-y-5">
          <div className="grid grid-cols-7 gap-1 text-center text-sm">
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
              <span key={d} className="pb-1 text-muted">
                {d}
              </span>
            ))}
            {monthCells(shownMonth.y, shownMonth.m).map((key, i) => {
              if (!key) return <span key={`blank-${i}`} />;
              const open = slotsByDay.get(key)?.length ?? 0;
              const picked = selected.filter((iso) => dayKey(iso) === key).length;
              const isShown = key === shownDay;
              return (
                <button
                  key={key}
                  disabled={open === 0}
                  onClick={() => setPickedDay(key)}
                  aria-pressed={isShown}
                  aria-label={`${keyLabel(key, { weekday: "long", month: "long", day: "numeric" })}: ${open} open`}
                  className={`slot-picker-month-day flex h-14 flex-col items-center justify-start gap-0.5 rounded-sm pt-1.5 ${
                    isShown ? "bg-ink text-paper" : open ? "bg-sheet hover:bg-rule/60" : "text-muted opacity-50"
                  } ${key === today ? "font-semibold underline underline-offset-4" : ""}`}
                >
                  {Number(key.slice(8))}
                  {open > 0 && (
                    <span className={`text-xs ${picked ? "rounded-sm bg-highlight px-1 text-on-highlight" : isShown ? "text-paper/70" : "text-muted"}`}>
                      {picked ? `${picked} picked` : `${open} open`}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {shownDay ? (
            <div className="slot-picker-month-times space-y-2">
              <h3 className="font-medium">{keyLabel(shownDay, { weekday: "long", month: "long", day: "numeric" })}</h3>
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">{(slotsByDay.get(shownDay) ?? []).map(slotButton)}</div>
            </div>
          ) : (
            <p className="text-sm text-muted">No open times this month.</p>
          )}
        </div>
      )}
      {isOwnProfile ? (
        <div className="slot-picker-own-profile sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-rule bg-paper px-4 py-4 text-sm">
          <p>This is your profile. This is how clients see your open times.</p>
          <a href="/dashboard" className="underline">
            Go to your dashboard
          </a>
        </div>
      ) : (
        <div className="slot-picker-checkout-bar sticky bottom-0 -mx-4 space-y-3 border-t border-rule bg-paper px-4 py-4">
          {error && (
            <p
              role="alert"
              className="text-sm font-medium text-red-700 dark:text-red-400"
            >
              {error}
            </p>
          )}
          {lastMinute.length > 0 && (
            <p role="note" className="slot-picker-no-refund-warning rounded-sm border border-highlight px-3 py-2 text-sm">
              <span className="font-medium">No refund if you cancel: </span>
              {lastMinute.length === 1
                ? `${selected.length === 1 ? "this session" : `your ${new Date(lastMinute[0]).toLocaleDateString(undefined, { weekday: "short" })} ${timeIn(lastMinute[0])} session`} starts within ${CLIENT_CANCEL_HOURS} hours, so it can't be cancelled online for a refund.`
                : `${lastMinute.length === selected.length ? "these sessions" : `${lastMinute.length} of these sessions`} start within ${CLIENT_CANCEL_HOURS} hours, so they can't be cancelled online for a refund.`}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {selected.length > 0 ? (
              <div className="text-sm">
                <p className="font-medium">
                  {selected.length}{" "}
                  {selected.length === 1 ? "session" : "sessions"} with{" "}
                  {consultant.name} · {total}
                </p>
                <p className="text-muted">
                  {selected
                    .map(
                      (iso) =>
                        `${new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} ${timeIn(iso)}`,
                    )
                    .join(" · ")}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted">Choose a time to continue.</p>
            )}
            {step === "pick" && (
              <button
                disabled={selected.length === 0}
                onClick={() => setStep("details")}
                className="rounded-sm bg-ink px-5 py-2.5 text-sm font-medium text-paper disabled:opacity-40"
              >
                Continue to payment
              </button>
            )}
          </div>
          {step === "details" && selected.length > 0 && (
            <form action={book} className="slot-picker-details-form flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-sm">
                Your name
                <input
                  name="name"
                  required
                  maxLength={100}
                  autoComplete="name"
                  defaultValue={me?.name ?? ""}
                  className="w-56 rounded-sm border border-rule bg-sheet px-3 py-2"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                {me ? "Signed in as" : "Email for the confirmation"}
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  readOnly={!!me}
                  defaultValue={me?.email ?? ""}
                  className={`w-64 rounded-sm border border-rule px-3 py-2 ${me ? "bg-paper text-muted" : "bg-sheet"}`}
                />
              </label>
              <button
                disabled={submitting}
                className="rounded-sm bg-ink px-5 py-2.5 text-sm font-medium text-paper disabled:opacity-40"
              >
                {submitting ? "Holding your times…" : `Pay ${total}`}
              </button>
              <button
                type="button"
                onClick={() => setStep("pick")}
                className="px-2 py-2.5 text-sm text-muted hover:text-ink"
              >
                Change times
              </button>
              <p className="basis-full text-xs text-muted">
                We hold these times for 30 minutes while you pay on Stripe.
              </p>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
