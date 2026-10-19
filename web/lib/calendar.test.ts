import { describe, expect, it } from "vitest";
import { addDays, buildWeeks, dayKey, monthCells, paginate, shiftMonth, weekKeys } from "./calendar";

// `npm test` runs with TZ=America/New_York, so "local" dates below are New York dates.
const at = (local: string) => new Date(local).getTime();
const days = (week: { date: Date }[]) => week.map((d) => d.date.toLocaleDateString("en-CA"));

describe("buildWeeks", () => {
  const now = at("2026-10-21T15:00:00"); // Wednesday

  it("starts every week on Sunday, even mid-week", () => {
    const [thisWeek, nextWeek] = buildWeeks(["2026-10-22T14:00:00.000Z", "2026-10-26T14:00:00.000Z"], now, 14);
    expect(days(thisWeek)).toEqual(["2026-10-18", "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24"]);
    expect(nextWeek[0].date.getDay()).toBe(0);
  });

  it("marks past, open and not-yet-open days", () => {
    const weeks = buildWeeks(["2026-11-03T14:00:00.000Z"], now, 14); // last day in the window: Nov 3
    expect(weeks[0].map((d) => d.state)).toEqual(["past", "past", "past", "open", "open", "open", "open"]);
    expect(weeks[2].map((d) => d.state)).toEqual(["open", "open", "open", "later", "later", "later", "later"]);
  });

  it("puts each slot on the visitor's local day", () => {
    // 02:00 UTC on Thursday is still Wednesday evening in New York.
    const [thisWeek] = buildWeeks(["2026-10-22T02:00:00.000Z"], now, 14);
    expect(thisWeek[3].isos).toEqual(["2026-10-22T02:00:00.000Z"]);
    expect(thisWeek[4].isos).toEqual([]);
  });

  it("drops a trailing week with nothing open, but keeps at least one week", () => {
    expect(buildWeeks(["2026-10-22T14:00:00.000Z"], now, 14)).toHaveLength(1);
    expect(buildWeeks([], now, 14)).toHaveLength(1);
  });
});

describe("monthCells", () => {
  it("lines day 1 up under its weekday, Sunday first", () => {
    expect(monthCells(2026, 10).slice(0, 5)).toEqual([null, null, null, null, "2026-10-01"]); // Oct 1 2026 is a Thursday
    expect(monthCells(2026, 11)[0]).toBe("2026-11-01"); // a Sunday: no blanks
  });

  it("knows month lengths, including leap years", () => {
    expect(monthCells(2028, 2).filter(Boolean)).toHaveLength(29);
    expect(monthCells(2026, 2).at(-1)).toBe("2026-02-28");
  });
});

describe("paginate", () => {
  const ten = Array.from({ length: 10 }, (_, i) => i);

  it("splits rows into pages of the given size", () => {
    expect(paginate(ten, 1, 5)).toEqual({ pages: 2, current: 1, rows: [5, 6, 7, 8, 9] });
  });

  it("clamps to the last page when filtering shrinks the list", () => {
    expect(paginate(ten.slice(0, 3), 1, 5)).toEqual({ pages: 1, current: 0, rows: [0, 1, 2] });
  });

  it("still reports one page when nothing matches", () => {
    expect(paginate([], 0, 5)).toEqual({ pages: 1, current: 0, rows: [] });
  });
});

describe("date keys", () => {
  it("adds days across month ends, leap days and clock changes", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-11-01", -1)).toBe("2026-10-31"); // New York leaves daylight time on Nov 1
  });

  it("gives the Sunday-to-Saturday week around a day, and later weeks", () => {
    expect(weekKeys("2026-10-21")).toEqual(["2026-10-18", "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24"]);
    expect(weekKeys("2026-10-18")[0]).toBe("2026-10-18"); // a Sunday starts its own week
    expect(weekKeys("2026-10-21", 2)[0]).toBe("2026-11-01");
  });

  it("moves months across year boundaries", () => {
    expect(shiftMonth({ y: 2026, m: 12 }, 1)).toEqual({ y: 2027, m: 1 });
    expect(shiftMonth({ y: 2026, m: 1 }, -1)).toEqual({ y: 2025, m: 12 });
  });

  it("names the day an instant falls on in a given zone", () => {
    expect(dayKey("2026-10-22T02:00:00Z", "America/New_York")).toBe("2026-10-21");
    expect(dayKey("2026-10-22T02:00:00Z", "Asia/Seoul")).toBe("2026-10-22");
  });
});
