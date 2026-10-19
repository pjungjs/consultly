export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export interface Consultant {
  id: string;
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
}

export interface DashboardSession {
  id: string;
  startsAt: string;
  endsAt: string;
  amountCents: number;
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

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { cache: "no-store", ...init });
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export interface ConsultantProfile {
  id: string;
  name: string;
  headline: string;
  bio: string;
  category: string;
  rateCents: number;
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
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
