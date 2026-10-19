"use client";

import { useState } from "react";
import { dayKey, keyLabel, monthCells, shiftMonth, weekKeys } from "@/lib/calendar";
import { timeIn } from "@/lib/zone";
import CalendarToolbar, { type CalendarView } from "./calendar-toolbar";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]; // Weeks run Sunday to Saturday

type CalendarSession = { id: string; startsAt: string; endsAt: string };

/**
 * Booked sessions on a Week or Month calendar in `zone` (consultant dashboard and My bookings).
 * Past sessions stay visible (muted). Clicking a day narrows the list below to that day.
 */
export default function SessionCalendar<S extends CalendarSession>({
  sessions,
  zone,
  now,
  selected,
  onSelect,
  describe,
}: {
  sessions: S[];
  zone: string;
  now: number;
  selected: string | null;
  onSelect: (day: string | null) => void;
  /** Short text next to the time in week view, e.g. the other person's name. */
  describe: (s: S) => string;
}) {
  const today = dayKey(now, zone);
  const thisMonth = { y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) };
  const [view, setView] = useState<CalendarView>("month");
  const [weekOffset, setWeekOffset] = useState(0);
  const [month, setMonth] = useState(thisMonth);

  const byDay = new Map<string, S[]>();
  for (const s of sessions) byDay.set(dayKey(s.startsAt, zone), [...(byDay.get(dayKey(s.startsAt, zone)) ?? []), s]);

  const week = weekKeys(today, weekOffset);
  const label =
    view === "week"
      ? `${keyLabel(week[0], { month: "short", day: "numeric" })} – ${keyLabel(week[6], week[0].slice(5, 7) === week[6].slice(5, 7) ? { day: "numeric" } : { month: "short", day: "numeric" })}`
      : keyLabel(`${month.y}-${String(month.m).padStart(2, "0")}-01`, { month: "long", year: "numeric" });

  const select = (key: string) => onSelect(key === selected ? null : key);

  return (
    <section aria-label="Calendar" className="session-calendar space-y-3">
      <CalendarToolbar
        view={view}
        onView={setView}
        label={label}
        onPrev={() => (view === "week" ? setWeekOffset(weekOffset - 1) : setMonth(shiftMonth(month, -1)))}
        onNext={() => (view === "week" ? setWeekOffset(weekOffset + 1) : setMonth(shiftMonth(month, 1)))}
        onToday={() => {
          setWeekOffset(0);
          setMonth(thisMonth);
          onSelect(null);
        }}
      />
      {view === "month" ? (
        <div className="session-calendar-month grid grid-cols-7 gap-1 text-center text-sm">
          {WEEKDAYS.map((d) => (
            <span key={d} className="pb-1 text-muted">
              {d}
            </span>
          ))}
          {monthCells(month.y, month.m).map((key, i) => {
            if (!key) return <span key={`blank-${i}`} />;
            const count = byDay.get(key)?.length ?? 0;
            const isSelected = key === selected;
            const past = key < today;
            return (
              <button
                key={key}
                disabled={count === 0}
                onClick={() => select(key)}
                aria-pressed={isSelected}
                aria-label={`${keyLabel(key, { weekday: "long", month: "long", day: "numeric" })}: ${count} session${count === 1 ? "" : "s"}`}
                className={`flex h-14 flex-col items-center justify-start gap-1 rounded-sm pt-1.5 ${
                  isSelected ? "bg-highlight text-on-highlight" : count ? `bg-sheet hover:bg-rule/60 ${past ? "opacity-60" : ""}` : "text-muted"
                } ${key === today ? "font-semibold underline underline-offset-4" : ""}`}
              >
                {Number(key.slice(8))}
                {count > 0 && (
                  <span className="flex gap-0.5" aria-hidden>
                    {Array.from({ length: Math.min(count, 4) }, (_, j) => (
                      <span key={j} className={`h-1.5 w-1.5 rounded-full ${isSelected ? "bg-on-highlight" : "bg-ink"}`} />
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        // Phones: one day per row. Wider screens: seven columns.
        <div className="session-calendar-week grid gap-2 sm:grid-cols-7 sm:gap-1">
          {week.map((key) => {
            const daySessions = byDay.get(key) ?? [];
            const isSelected = key === selected;
            return (
              <button
                key={key}
                disabled={daySessions.length === 0}
                onClick={() => select(key)}
                aria-pressed={isSelected}
                className={`session-calendar-day grid grid-cols-[3.5rem_1fr] gap-2 rounded-sm p-2 text-left text-sm sm:block sm:min-h-32 ${
                  isSelected ? "bg-highlight text-on-highlight" : daySessions.length ? "bg-sheet hover:bg-rule/60" : ""
                } ${key < today ? "opacity-60" : ""}`}
              >
                <span className="block">
                  <span className={`block ${isSelected ? "" : "text-muted"}`}>{keyLabel(key, { weekday: "short" })}</span>
                  <span className={`block font-display text-lg font-semibold ${key === today ? "underline underline-offset-4" : ""}`}>
                    {Number(key.slice(8))}
                  </span>
                </span>
                <span className="block space-y-1 sm:mt-2">
                  {daySessions.length === 0 && <span className={`block ${isSelected ? "" : "text-muted"}`}>—</span>}
                  {daySessions.map((s) => (
                    <span key={s.id} className="block leading-tight">
                      <span className="font-semibold">{timeIn(s.startsAt, zone)}</span> <span className="break-words">{describe(s)}</span>
                    </span>
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
