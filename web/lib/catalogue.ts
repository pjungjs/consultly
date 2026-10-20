// Sort orders for the consultant list. Pure, so it can be unit-tested.

// Listed in this order; the first is the default, so the free onboarding call leads the list.
export const SORTS = {
  "price-asc": "Price: low to high",
  "price-desc": "Price: high to low",
  soonest: "Soonest available",
  "most-open": "Most open this week",
  name: "Name (A–Z)",
} as const;

export type SortKey = keyof typeof SORTS;

export const DEFAULT_SORT: SortKey = "price-asc";

type Sortable = { name: string; rateCents: number; slots: string[] };

/** Returns a sorted copy. Ties fall back to name so the order never jumps around between renders. */
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
  return [...rows].sort((a, b) => by[sort](a, b) || a.name.localeCompare(b.name));
}
