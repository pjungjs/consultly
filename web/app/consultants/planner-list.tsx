"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch, CATEGORIES, formatPrice, type Consultant, type Me, type SlotList } from "@/lib/api";
import { paginate } from "@/lib/calendar";
import { DEFAULT_SORT, SORTS, sortConsultants, type SortKey } from "@/lib/catalogue";
import { cityFromZone } from "@/lib/zone";

type Row = Consultant & { slots: string[] };

const DAYS = 7;
const PRICE_STEP = 2500;
const PAGE_SIZE = 5;

// Client component so every time and day bucket uses the visitor's own timezone.
// Search and filters run here in the browser; the whole catalogue is already loaded.
export default function PlannerList({ consultants: listed }: { consultants: Row[] }) {
  // A demo visitor's own Jason isn't in the public catalogue (nobody else can see him), so he's added here.
  const [demoRow, setDemoRow] = useState<Row | null>(null);
  useEffect(() => {
    apiFetch("/me", { credentials: "include", cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<Me>) : null))
      .then(async (me) => {
        const id = me?.demo?.consultantId;
        if (!id) return;
        const [consultant, slots] = await Promise.all([apiFetch(`/consultants/${id}`), apiFetch(`/consultants/${id}/slots`)]);
        if (consultant.ok && slots.ok)
          setDemoRow({ ...((await consultant.json()) as Consultant), slots: ((await slots.json()) as SlotList).slots });
      })
      .catch(() => setDemoRow(null));
  }, []);
  const consultants = demoRow ? [demoRow, ...listed] : listed;
  const maxRate = Math.max(0, ...consultants.map((c) => c.rateCents)); // 0 with no consultants, not -Infinity
  const ceiling = Math.ceil(maxRate / PRICE_STEP) * PRICE_STEP;
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  // null = no price limit. Storing the ceiling instead would go stale: Next keeps this state when you leave the page
  // and come back, so a consultant priced above the old ceiling would stay filtered out.
  const [priceLimit, setPriceLimit] = useState<number | null>(null);
  const maxPrice = priceLimit ?? ceiling;
  const [thisWeek, setThisWeek] = useState(false);
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<SortKey>(DEFAULT_SORT);

  // The calendar week, Sunday to Saturday; days already gone are dimmed.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const week = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - today.getDay() + i);
    return d;
  });
  const weekEnd = new Date(week[DAYS - 1]);
  weekEnd.setDate(weekEnd.getDate() + 1);
  const sameDay = (iso: string, d: Date) => new Date(iso).toDateString() === d.toDateString();

  const q = query.trim().toLowerCase();
  const matches = consultants.filter(
    (c) =>
      (!q || `${c.name} ${c.headline} ${c.bio} ${c.category}`.toLowerCase().includes(q)) &&
      (!category || c.category === category) &&
      c.rateCents <= maxPrice &&
      (!thisWeek || c.slots.some((iso) => new Date(iso) < weekEnd)),
  );
  const shown = sortConsultants(matches, sort, weekEnd);
  const filtered = q || category || maxPrice < ceiling || thisWeek;
  // Page the filtered results; any filter change goes back to page 1 (see `refilter`).
  const { pages, current, rows: pageRows } = paginate(shown, page, PAGE_SIZE);
  const refilter =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(0);
    };

  const chip = (active: boolean) =>
    `rounded-sm px-3 py-1.5 text-sm ${active ? "bg-ink text-paper" : "bg-sheet hover:bg-rule/60"}`;

  return (
    <div className="planner-list space-y-6">
      <div className="space-y-4">
        <label className="block">
          <span className="sr-only">Search consultants</span>
          <input
            type="search"
            value={query}
            onChange={(e) => refilter(setQuery)(e.target.value)}
            placeholder="Search by name, specialty or topic"
            className="w-full rounded-sm border border-rule bg-sheet px-4 py-3"
          />
        </label>
        <div className="planner-categories flex flex-wrap items-center gap-2" role="group" aria-label="Category">
          <button onClick={() => refilter(setCategory)(null)} aria-pressed={!category} className={chip(!category)}>
            All
          </button>
          {CATEGORIES.map((cat) => (
            <button key={cat} onClick={() => refilter(setCategory)(category === cat ? null : cat)} aria-pressed={category === cat} className={chip(category === cat)}>
              {cat}
            </button>
          ))}
        </div>
        <div className="planner-filters flex flex-wrap items-center gap-x-8 gap-y-3 text-sm">
          <label className="flex items-center gap-3">
            Up to <span className="w-12 font-medium">{formatPrice(maxPrice)}</span>
            <input
              type="range"
              min={PRICE_STEP}
              max={ceiling}
              step={PRICE_STEP}
              value={maxPrice}
              onChange={(e) => refilter(setPriceLimit)(Number(e.target.value) >= ceiling ? null : Number(e.target.value))}
              className="w-40 accent-[var(--ink)]"
            />
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={thisWeek} onChange={(e) => refilter(setThisWeek)(e.target.checked)} className="accent-[var(--ink)]" />
            Available this week
          </label>
          <label className="planner-sort flex items-center gap-2">
            Sort by
            <select value={sort} onChange={(e) => refilter(setSort)(e.target.value as SortKey)} className="rounded-sm border border-rule bg-sheet px-2 py-1.5">
              {(Object.keys(SORTS) as SortKey[]).map((key) => (
                <option key={key} value={key}>
                  {SORTS[key]}
                </option>
              ))}
            </select>
          </label>
          {filtered && (
            <button
              onClick={() => {
                setQuery("");
                setCategory(null);
                setPriceLimit(null);
                setThisWeek(false);
                setPage(0);
              }}
              className="underline"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      <div>
        <div className="planner-header hidden grid-cols-[1fr_auto_15rem] gap-6 border-b border-rule pb-2 text-sm text-muted sm:grid">
          <span>
            {shown.length} consultant{shown.length === 1 ? "" : "s"}
          </span>
          <span className="w-24 text-right">Per session</span>
          <div className="grid grid-cols-7 text-center" aria-hidden>
            {week.map((d) => (
              <span key={d.toISOString()}>{d.toLocaleDateString(undefined, { weekday: "narrow" })}</span>
            ))}
          </div>
        </div>
        {shown.length === 0 ? (
          <p className="py-8 text-muted">No consultants match. Try a different search or clear the filters.</p>
        ) : (
          <ul className="planner-rows">
            {pageRows.map((c) => {
              const next = c.slots[0];
              return (
                <li key={c.id} className="planner-row border-b border-rule">
                  <Link
                    href={`/consultants/${c.id}`}
                    className="grid gap-3 py-5 hover:bg-sheet sm:grid-cols-[1fr_auto_15rem] sm:items-center sm:gap-6"
                  >
                    <div>
                      <p className="font-display text-xl font-semibold">
                        {c.name} <span className="font-sans text-sm font-normal text-muted">in {cityFromZone(c.timezone)}</span>
                      </p>
                      {c.demo && (
                        <p className="mt-1 w-fit rounded-sm bg-highlight px-2 py-0.5 text-xs font-medium text-on-highlight">
                          Your demo consultant: only you can see and book him
                        </p>
                      )}
                      <p className="text-sm text-muted">
                        {c.headline} · {c.category}
                      </p>
                      <p className="mt-2 text-sm">
                        {next
                          ? `Next open ${new Date(next).toLocaleString(undefined, {
                              weekday: "short",
                              hour: "numeric",
                              minute: "2-digit",
                            })}`
                          : "Fully booked for the next 60 days"}
                      </p>
                    </div>
                    <span className="text-lg font-medium sm:w-24 sm:text-right">
                      {formatPrice(c.rateCents)}
                      <span className="block text-xs font-normal text-muted">{c.slotMinutes} min</span>
                    </span>
                    <div className="grid grid-cols-7 gap-1" aria-label="Open hours this week">
                      {week.map((d) => {
                        const open = c.slots.filter((iso) => sameDay(iso, d)).length;
                        return (
                          <div
                            key={d.toISOString()}
                            title={`${d.toLocaleDateString(undefined, { weekday: "long" })}: ${open} open`}
                            className={`flex h-10 flex-col justify-end rounded-sm ${d < today ? "bg-rule/20" : "bg-rule/50"}`}
                          >
                            <div className="rounded-sm bg-ink" style={{ height: `${Math.min(open, 8) * 12.5}%` }} />
                          </div>
                        );
                      })}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {pages > 1 && (
          <nav aria-label="Pages" className="planner-pagination mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
            <p className="text-muted">
              Showing {current * PAGE_SIZE + 1}–{current * PAGE_SIZE + pageRows.length} of {shown.length}
            </p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(current - 1)} disabled={current === 0} className="rounded-sm px-3 py-1.5 hover:bg-sheet disabled:opacity-40">
                Previous
              </button>
              {Array.from({ length: pages }, (_, i) => (
                <button
                  key={i}
                  onClick={() => setPage(i)}
                  aria-current={i === current ? "page" : undefined}
                  className={`rounded-sm px-3 py-1.5 ${i === current ? "bg-ink text-paper" : "hover:bg-sheet"}`}
                >
                  {i + 1}
                </button>
              ))}
              <button onClick={() => setPage(current + 1)} disabled={current === pages - 1} className="rounded-sm px-3 py-1.5 hover:bg-sheet disabled:opacity-40">
                Next
              </button>
            </div>
          </nav>
        )}
        <p className="mt-3 text-sm text-muted">Bars show open hours each day this week, in your timezone.</p>
      </div>
    </div>
  );
}
