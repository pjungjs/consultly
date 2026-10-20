import { describe, expect, it } from "vitest";
import { sortConsultants } from "./catalogue";

const weekEnd = new Date("2026-10-25T00:00:00Z");
const rows = [
  { name: "Cara", rateCents: 15000, slots: ["2026-10-22T10:00:00Z", "2026-10-23T10:00:00Z", "2026-10-24T10:00:00Z"] },
  { name: "Ava", rateCents: 9000, slots: ["2026-10-30T10:00:00Z"] },
  { name: "Ben", rateCents: 15000, slots: [] },
  { name: "Dan", rateCents: 20000, slots: ["2026-10-21T10:00:00Z", "2026-11-02T10:00:00Z"] },
];
const order = (sort: Parameters<typeof sortConsultants>[1]) => sortConsultants(rows, sort, weekEnd).map((r) => r.name);

describe("sortConsultants", () => {
  it("puts the soonest opening first and fully booked last", () => {
    expect(order("soonest")).toEqual(["Dan", "Cara", "Ava", "Ben"]);
  });

  it("sorts by price both ways, breaking ties by name", () => {
    expect(order("price-asc")).toEqual(["Ava", "Ben", "Cara", "Dan"]);
    expect(order("price-desc")).toEqual(["Dan", "Ben", "Cara", "Ava"]);
  });

  it("ranks by open times before the end of this week", () => {
    expect(order("most-open")).toEqual(["Cara", "Dan", "Ava", "Ben"]);
  });

  it("sorts by name and never changes the input", () => {
    expect(order("name")).toEqual(["Ava", "Ben", "Cara", "Dan"]);
    expect(rows.map((r) => r.name)).toEqual(["Cara", "Ava", "Ben", "Dan"]);
  });

  it("keeps free sessions (the onboarding call) first in every sort", () => {
    const withFree = [...rows, { name: "Zed Onboarding", rateCents: 0, slots: [] }];
    for (const sort of ["soonest", "price-desc", "most-open", "name"] as const)
      expect(sortConsultants(withFree, sort, weekEnd)[0].name).toBe("Zed Onboarding");
  });
});
