"use client";

export type CalendarView = "week" | "month";

// One toolbar for every calendar: Week | Month switch, previous/next, and Today to jump back.
export default function CalendarToolbar({
  view,
  onView,
  label,
  onPrev,
  onNext,
  onToday,
  prevDisabled,
  nextDisabled,
}: {
  view: CalendarView;
  onView: (view: CalendarView) => void;
  label: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  prevDisabled?: boolean;
  nextDisabled?: boolean;
}) {
  const unit = view === "week" ? "week" : "month";
  return (
    <div className="calendar-toolbar flex flex-wrap items-center justify-between gap-3">
      <h2 className="calendar-toolbar-label font-display text-2xl font-semibold" aria-live="polite">
        {label}
      </h2>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <div role="group" aria-label="Calendar view" className="calendar-toolbar-views flex rounded-sm bg-sheet p-0.5">
          {(["week", "month"] as const).map((v) => (
            <button
              key={v}
              onClick={() => onView(v)}
              aria-pressed={view === v}
              className={`rounded-sm px-3 py-1 ${view === v ? "bg-ink text-paper" : "text-muted hover:text-ink"}`}
            >
              {v === "week" ? "Week" : "Month"}
            </button>
          ))}
        </div>
        <button onClick={onToday} className="calendar-toolbar-today rounded-sm border border-rule px-3 py-1 hover:bg-sheet">
          Today
        </button>
        <div className="calendar-toolbar-paging flex">
          <button onClick={onPrev} disabled={prevDisabled} aria-label={`Previous ${unit}`} className="rounded-sm px-3 py-1 text-base hover:bg-sheet disabled:opacity-30">
            ‹
          </button>
          <button onClick={onNext} disabled={nextDisabled} aria-label={`Next ${unit}`} className="rounded-sm px-3 py-1 text-base hover:bg-sheet disabled:opacity-30">
            ›
          </button>
        </div>
      </div>
    </div>
  );
}
