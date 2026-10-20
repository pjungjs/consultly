/**
 * Where to reach the API. In the browser: NEXT_PUBLIC_API_URL, which is "/api" when deployed, so requests go to
 * this site and Next.js forwards them (see next.config.ts). That keeps the sign-in cookie first-party without
 * a custom domain. On the server: API_INTERNAL_URL, the API's real address. Locally both default to :4000.
 */
export const API_URL =
  typeof window === "undefined"
    ? (process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000")
    : (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000");

export interface Consultant {
  id: string;
  demo?: boolean; // a demo visitor's private copy
  name: string;
  headline: string;
  category: string;
  bio: string;
  rateCents: number;
  slotMinutes: number;
  timezone: string;
}

export interface SlotList {
  timezone: string;
  slotMinutes: number;
  slots: string[]; // UTC ISO start times
}

export interface Order {
  id: string;
  consultantId: string;
  clientName: string;
  clientEmail: string;
  status: "PENDING" | "CONFIRMED" | "CANCELLED";
  amountCents: number;
  consultant: { name: string; timezone: string };
  bookings: { id: string; startsAt: string; endsAt: string; status?: "PENDING" | "CONFIRMED" | "CANCELLED"; amountCents?: number; cancelledBy?: "CLIENT" | "CONSULTANT" | null }[];
  brief?: BriefBadge | null;
}

export interface Me {
  email: string;
  name: string | null;
  timezone: string | null;
  consultant: { id: string; name: string } | null;
  /** Set for a "Try the demo" account: which side you're on, and your private demo consultant. */
  demo: { role: "client" | "consultant"; consultantId: string | null } | null;
}

export interface DashboardSession {
  id: string;
  startsAt: string;
  endsAt: string;
  amountCents: number;
  status: "CONFIRMED" | "CANCELLED";
  cancelledBy: "CLIENT" | "CONSULTANT" | null;
  order: { id: string; clientName: string; clientEmail: string; clientTimezone: string; brief: BriefBadge | null };
}

export interface Dashboard {
  consultant: { id: string; name: string; timezone: string; status: ListingStatus };
  stats: { thisWeekCents: number; upcomingCount: number; earnedCents: number };
  upcoming: DashboardSession[];
  past: DashboardSession[];
}

export interface WeeklyHours {
  weekday: number; // 1 = Monday ... 7 = Sunday
  startTime: string;
  endTime: string;
}

export interface AvailabilitySnapshot {
  timezone: string;
  weekly: WeeklyHours[];
  timeOff: { id: string; from: string; to: string; note: string | null }[];
  conflicts: { id: string; startsAt: string; clientName: string }[];
}

/** A failed API call; `status` lets pages tell "not found" (404) apart from real errors. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { cache: "no-store", ...init });
  if (!res.ok) throw new ApiError(res.status, `${init?.method ?? "GET"} ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

/** Window event that shows an error toast (see app/toaster.tsx). */
export const TOAST_EVENT = "consultly:toast";

export function showErrorToast(message: string) {
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: message }));
}

const GENERIC_SERVER_MESSAGE = "Internal server error";

/**
 * fetch() for browser calls to the API. Unexpected failures (no connection, a server error, a sleeping server
 * behind the proxy) show a toast and come back as a JSON response with `message: null`, so the caller's usual
 * `if (!res.ok)` path runs without also showing an inline message. Expected errors (4xx, or a 5xx that explains
 * itself, like a failed email) pass through untouched for the caller to show where they belong.
 */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const unexpected = (message: string, status: number) => {
    showErrorToast(message);
    return new Response(JSON.stringify({ message: null }), { status, headers: { "Content-Type": "application/json" } });
  };
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, init);
  } catch {
    return unexpected("Couldn't reach Consultly. Check your connection and try again.", 503);
  }
  if (res.status < 500) return res;
  const body = await res
    .clone()
    .json()
    .catch(() => null);
  const message = typeof body?.message === "string" ? body.message : null;
  if (message && message !== GENERIC_SERVER_MESSAGE) return res;
  return unexpected("Something went wrong on our side. Please try again in a moment.", res.status);
}

export const isNotFound = (err: unknown) => err instanceof ApiError && err.status === 404;

export interface ConsultantProfile {
  id: string;
  name: string;
  headline: string;
  bio: string;
  category: string;
  rateCents: number;
  slotMinutes: number;
  timezone: string;
  paused: boolean;
  status: ListingStatus;
}

/** "live": in the catalogue; "needs-hours": hidden until weekly hours are set; "paused": hidden by the consultant. */
export type ListingStatus = "live" | "needs-hours" | "paused";

/** Clients can cancel online for a full refund until this many hours before a session (matches the API). */
export const CLIENT_CANCEL_HOURS = 24;

export interface Profile {
  email: string;
  name: string | null;
  timezone: string | null;
  consultant: ConsultantProfile | null;
}

// sessionStorage: the unpaid checkout this tab went to Stripe for. Coming back to the booking page without paying
// (the browser's Back button skips Stripe's own "back" link) releases it, so the times don't stay held.
const PENDING_CHECKOUT = "consultly-pending-checkout";

export function rememberCheckout(orderId: string) {
  try {
    sessionStorage.setItem(PENDING_CHECKOUT, orderId);
  } catch {} // storage blocked: the hold just expires on its own after 30 minutes
}

/** Returns the remembered checkout (if any) and forgets it. */
export function takeCheckout(): string | null {
  try {
    const id = sessionStorage.getItem(PENDING_CHECKOUT);
    sessionStorage.removeItem(PENDING_CHECKOUT);
    return id;
  } catch {
    return null;
  }
}

/** How to name the signed-in account: demo accounts have made-up addresses, so they're named by their side. */
export const accountLabel = (email: string) =>
  /^demo-[a-f0-9]{12}@consultly\.test$/i.test(email)
    ? "the Demo client"
    : /^jason-[a-f0-9]{12}@consultly\.test$/i.test(email)
      ? "the Demo consultant"
      : email;

/** Window event fired after a profile save, so the account menu can refresh without a page change. */
export const PROFILE_UPDATED = "consultly:profile-updated";

/** READY: prep sheet written. NO_TEXT: scanned PDF. UNAVAILABLE: no AI key (demo mode). FAILED: the AI step failed. */
export type BriefStatus = "READY" | "NO_TEXT" | "UNAVAILABLE" | "FAILED";
export type BriefBadge = { status: BriefStatus; source: "CLAUDE" | "SAMPLE" | "NONE" };

/** The consultant's prep sheet, as the AI service returns it. */
export interface PrepSheet {
  one_liner: string;
  background: string;
  goals: string[];
  key_facts: string[];
  questions: string[];
  gaps: string[];
  agenda: { minutes: number; topic: string }[];
}

export interface Brief extends BriefBadge {
  filename: string;
  sizeBytes: number;
  pages: number;
  summary: PrepSheet | null;
  model: string | null;
  message: string | null;
  updatedAt: string;
}

export const CATEGORIES = ["Strategy", "Tech", "Design", "Finance", "Legal & pricing"] as const;

export const formatPrice = (cents: number) =>
  cents === 0
    ? "Free"
    : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
