// Sort orders for the consultant list. Pure, so it can be unit-tested.

export const SORTS = {
  soonest: "Soonest available",
  "price-asc": "Price: low to high",
  "price-desc": "Price: high to low",
  "most-open": "Most open this week",
  name: "Name (A–Z)",
} as const;

export type SortKey = keyof typeof SORTS;

type Sortable = { name: string; rateCents: number; slots: string[] };

/**
 * Returns a sorted copy. Free sessions (the onboarding call) always come first, whatever the sort, so every
 * newcomer sees them. Ties fall back to name so the order never jumps around between renders.
 */
export function sortConsultants<T extends Sortable>(rows: T[], sort: SortKey, weekEnd: Date): T[] {
  const next = (c: T) => (c.slots[0] ? new Date(c.slots[0]).getTime() : Infinity); // fully booked sorts last
  const openThisWeek = (c: T) => c.slots.filter((iso) => new Date(iso) < weekEnd).length;
  const by: Record<SortKey, (a: T, b: T) => number> = {
    soonest: (a, b) => next(a) - next(b),
    "price-asc": (a, b) => a.rateCents - b.rateCents,
    "price-desc": (a, b) => b.rateCents - a.rateCents,
    "most-open": (a, b) => openThisWeek(b) - openThisWeek(a),
    name: () => 0,
  };
  const pinned = (c: T) => (c.rateCents === 0 ? 0 : 1);
  return [...rows].sort((a, b) => pinned(a) - pinned(b) || by[sort](a, b) || a.name.localeCompare(b.name));
}
