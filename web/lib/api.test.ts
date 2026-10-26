import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accountLabel, apiFetch, formatPrice, TOAST_EVENT } from "./api";

describe("formatPrice", () => {
  it("shows free sessions as Free and whole dollars without cents", () => {
    expect(formatPrice(0)).toBe("Free");
    expect(formatPrice(15000)).toBe("$150");
    expect(formatPrice(12550)).toBe("$125.50");
  });
});

describe("accountLabel", () => {
  it("names demo accounts by their side and shows real emails as they are", () => {
    expect(accountLabel("demo-client-0123456789ab@consultly.test")).toBe("the Demo client");
    expect(accountLabel("demo-consultant-0123456789ab@consultly.test")).toBe("the Demo consultant");
    expect(accountLabel("jason@consultly.test")).toBe("jason@consultly.test");
  });
});

describe("apiFetch", () => {
  const toasts: string[] = [];
  beforeEach(() => {
    toasts.length = 0;
    const target = new EventTarget();
    target.addEventListener(TOAST_EVENT, (e) => toasts.push((e as CustomEvent<string>).detail));
    vi.stubGlobal("window", target);
  });
  afterEach(() => vi.unstubAllGlobals());

  const respond = (status: number, body: unknown) =>
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })));

  it("passes expected errors through for the page to show, without a toast", async () => {
    respond(409, { message: "That time was just taken." });
    const res = await apiFetch("/orders");
    expect(res.status).toBe(409);
    expect((await res.json()).message).toBe("That time was just taken.");
    expect(toasts).toEqual([]);
  });

  it("passes through a server error that explains itself", async () => {
    respond(502, { message: "We couldn't send an email." });
    expect((await (await apiFetch("/auth/magic-link")).json()).message).toBe("We couldn't send an email.");
    expect(toasts).toEqual([]);
  });

  it("toasts an unexplained server error and leaves no inline message", async () => {
    respond(500, { message: "Internal server error" });
    const res = await apiFetch("/me");
    expect(res.ok).toBe(false);
    expect((await res.json()).message).toBeNull();
    expect(toasts).toHaveLength(1);
  });

  it("toasts when the server can't be reached at all", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const res = await apiFetch("/me");
    expect(res.status).toBe(503);
    expect(toasts[0]).toMatch(/Couldn't reach Consultly/);
  });
});
