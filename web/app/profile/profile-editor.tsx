"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { accountLabel, apiFetch, CATEGORIES, PROFILE_UPDATED, type ConsultantProfile, type Profile } from "@/lib/api";
import { cityFromZone } from "@/lib/zone";

type State = { kind: "loading" } | { kind: "signed-out" } | { kind: "ready"; profile: Profile };
type Message = { kind: "ok" | "error"; text: string } | null;

// All IANA zones the browser knows, for the time zone pickers.
const ZONES = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];

async function save<T>(path: string, body: unknown): Promise<T> {
  const res = await apiFetch(`/me/${path}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(Array.isArray(json.message) ? json.message.join(", ") : (json.message ?? ""));
  return json;
}

// Your own details for everyone; consultants also edit what clients see on their profile.
export default function ProfileEditor() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    apiFetch(`/me/profile`, { credentials: "include", cache: "no-store" })
      .then(async (res) => (res.ok ? { kind: "ready" as const, profile: (await res.json()) as Profile } : { kind: "signed-out" as const }))
      .then(setState)
      .catch(() => setState({ kind: "signed-out" }));
  }, []);

  if (state.kind === "loading") return <p className="text-muted">Loading…</p>;
  if (state.kind === "signed-out") {
    return (
      <div className="profile-signed-out max-w-xl space-y-4">
        <h1 className="font-display text-4xl font-semibold tracking-tight">Profile</h1>
        <p className="text-muted">Sign in to edit your details.</p>
        <Link href="/my-bookings" className="inline-block rounded-sm bg-ink px-5 py-2.5 text-sm font-medium text-paper">
          Sign in
        </Link>
      </div>
    );
  }

  const { profile } = state;
  const setConsultant = (consultant: ConsultantProfile) => setState({ kind: "ready", profile: { ...profile, consultant } });
  return (
    <div className="profile-page max-w-2xl space-y-14">
      <div className="space-y-4">
        <div className="space-y-1">
          <h1 className="font-display text-4xl font-semibold tracking-tight">Profile</h1>
          <p className="text-sm text-muted">
            {accountLabel(profile.email) === profile.email
              ? <>Signed in as {profile.email}. Your email is how you sign in, so it can&apos;t be changed here.</>
              : <>Signed in as {accountLabel(profile.email)} ({profile.email}, a made-up demo address). Changes stay in your private demo until you reset it.</>}
          </p>
        </div>
        <Roles consultant={profile.consultant} />
      </div>
      <ClientDetails
        profile={profile}
        onSaved={(details) =>
          setState({
            kind: "ready",
            profile: { ...profile, ...details, consultant: profile.consultant && { ...profile.consultant, ...details } },
          })
        }
      />
      {profile.consultant ? (
        <ConsultantDetails key={profile.consultant.id} consultant={profile.consultant} onChange={setConsultant} />
      ) : (
        <BecomeConsultant name={profile.name} onCreated={setConsultant} />
      )}
    </div>
  );
}

const STATUS_TEXT = {
  live: "Your consultant profile is live: clients can find and book you.",
  "needs-hours": "Your consultant profile is hidden until you set weekly hours.",
  paused: "Your consultant profile is paused: hidden from clients, no new bookings. Existing bookings stay.",
} as const;

/** Spells out which roles this email has, so it's never a guess. */
function Roles({ consultant }: { consultant: ConsultantProfile | null }) {
  return (
    <div className="profile-roles space-y-2 rounded-sm border border-rule px-4 py-3 text-sm">
      <p className="font-medium">
        {consultant ? "You're a client and a consultant on Consultly." : "You're a client on Consultly."}
      </p>
      <ul className="space-y-1 text-muted">
        <li>
          <span className="font-medium text-ink">Client:</span> book sessions with any consultant; they&apos;re in{" "}
          <Link href="/my-bookings" className="underline">
            My bookings
          </Link>
          .
        </li>
        {consultant && (
          <li>
            <span className="font-medium text-ink">Consultant:</span> {STATUS_TEXT[consultant.status]}{" "}
            <Link href="/dashboard" className="underline">
              Dashboard
            </Link>
          </li>
        )}
      </ul>
    </div>
  );
}

function Notice({ message }: { message: Message }) {
  if (!message) return null;
  return (
    <p role={message.kind === "error" ? "alert" : "status"} className={`text-sm ${message.kind === "error" ? "text-red-700 dark:text-red-400" : "text-muted"}`}>
      {message.text}
    </p>
  );
}

const field = "w-full rounded-sm border border-rule bg-sheet px-3 py-2";

function ZoneSelect({ name, value }: { name: string; value: string }) {
  return (
    <select name={name} defaultValue={value} className={field}>
      {(ZONES.includes(value) ? ZONES : [value, ...ZONES]).map((z) => (
        <option key={z} value={z}>
          {z.replaceAll("_", " ")}
        </option>
      ))}
    </select>
  );
}

/** Name and time zone for the whole account; a consultant's listing and weekly hours use them too. */
function ClientDetails({ profile, onSaved }: { profile: Profile; onSaved: (details: { name: string; timezone: string }) => void }) {
  const [message, setMessage] = useState<Message>(null);
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  // React resets a form to its default values after the action runs, so the defaults must be the saved values.
  const [saved, setSaved] = useState({ name: profile.name ?? "", timezone: profile.timezone ?? browserZone });

  async function submit(form: FormData) {
    setMessage(null);
    try {
      const next = await save<{ name: string; timezone: string }>("profile", { name: form.get("name"), timezone: form.get("timezone") });
      const movedZone = next.timezone !== saved.timezone;
      setSaved(next);
      onSaved(next);
      window.dispatchEvent(new Event(PROFILE_UPDATED)); // the account menu shows the new initial
      setMessage({
        kind: "ok",
        text:
          profile.consultant && movedZone
            ? `Saved. Your weekly hours now run in ${cityFromZone(next.timezone)} time; check the Availability tab for sessions that no longer fit.`
            : "Saved.",
      });
    } catch (err) {
      setMessage({ kind: "error", text: (err as Error).message });
    }
  }

  return (
    <section className="profile-details space-y-4">
      <form action={submit} className="profile-client-form grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Name
          <input key={saved.name} name="name" required maxLength={100} defaultValue={saved.name} autoComplete="name" className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Time zone
          <ZoneSelect key={saved.timezone} name="timezone" value={saved.timezone} />
        </label>
        <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
          <button className="rounded-sm bg-ink px-5 py-2.5 text-sm font-medium text-paper">Save</button>
          <Notice message={message} />
        </div>
      </form>
    </section>
  );
}

function ConsultantDetails({ consultant, onChange }: { consultant: ConsultantProfile; onChange: (c: ConsultantProfile) => void }) {
  const [message, setMessage] = useState<Message>(null);
  const [saved, setSaved] = useState(consultant);
  const [busy, setBusy] = useState(false);

  async function setPaused(paused: boolean) {
    setBusy(true);
    setMessage(null);
    try {
      const next = await save<ConsultantProfile>("consultant/status", { paused });
      setSaved(next);
      onChange(next);
      setMessage({ kind: "ok", text: paused ? "Paused. You're hidden from clients until you resume." : "Resumed. Clients can book you again." });
    } catch (err) {
      setMessage({ kind: "error", text: (err as Error).message });
    }
    setBusy(false);
  }

  async function submit(form: FormData) {
    setMessage(null);
    try {
      const next = await save<ConsultantProfile>("consultant/profile", {
        headline: form.get("headline"),
        bio: form.get("bio"),
        category: form.get("category"),
        rateCents: Math.round(Number(form.get("rate")) * 100),
        slotMinutes: Number(form.get("slotMinutes")),
      });
      setSaved(next);
      onChange(next);
      setMessage({ kind: "ok", text: "Saved. Clients see the changes right away; existing bookings keep their price." });
    } catch (err) {
      setMessage({ kind: "error", text: (err as Error).message });
    }
  }

  return (
    <section className="profile-consultant space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-2xl font-semibold">Consultant profile</h2>
        <Link href={`/consultants/${consultant.id}`} className="text-sm underline">
          View as a client sees it
        </Link>
      </div>
      <div className="profile-consultant-status flex flex-wrap items-center justify-between gap-3 rounded-sm bg-sheet px-4 py-3 text-sm">
        <p>{STATUS_TEXT[saved.status]}</p>
        {saved.status === "needs-hours" ? (
          <Link href="/dashboard?tab=availability" className="font-medium underline">
            Set weekly hours
          </Link>
        ) : (
          <button onClick={() => setPaused(!saved.paused)} disabled={busy} className="rounded-sm border border-rule px-3 py-1.5 font-medium hover:bg-paper disabled:opacity-40">
            {saved.paused ? "Resume profile" : "Pause profile"}
          </button>
        )}
      </div>
      <form action={submit} className="profile-consultant-form grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Category
          <select name="category" defaultValue={saved.category} className={field}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          Headline
          <input name="headline" required maxLength={120} defaultValue={saved.headline} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          Bio
          <textarea name="bio" required maxLength={1000} rows={5} defaultValue={saved.bio} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Price per session (USD)
          <input name="rate" type="number" required min={10} max={1000} step={5} defaultValue={saved.rateCents / 100} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Session length
          <select name="slotMinutes" defaultValue={saved.slotMinutes} className={field}>
            <option value={30}>30 minutes</option>
            <option value={60}>60 minutes</option>
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
          <button className="rounded-sm bg-ink px-5 py-2.5 text-sm font-medium text-paper">Save consultant profile</button>
          <Notice message={message} />
        </div>
      </form>
    </section>
  );
}

/** Self-serve sign-up as a consultant. (A real launch would add an admin review step before going live.) */
function BecomeConsultant({ name, onCreated }: { name: string | null; onCreated: (c: ConsultantProfile) => void }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  async function submit(form: FormData) {
    setMessage(null);
    try {
      const res = await apiFetch(`/me/consultant`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          headline: form.get("headline"),
          bio: form.get("bio"),
          category: form.get("category"),
          rateCents: Math.round(Number(form.get("rate")) * 100),
          slotMinutes: Number(form.get("slotMinutes")),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(Array.isArray(json.message) ? json.message.join(", ") : (json.message ?? ""));
      window.dispatchEvent(new Event(PROFILE_UPDATED)); // the account menu gains "Dashboard"
      onCreated(json);
    } catch (err) {
      setMessage({ kind: "error", text: (err as Error).message });
    }
  }

  if (!open) {
    return (
      <section className="profile-become-consultant space-y-3">
        <h2 className="font-display text-2xl font-semibold">Become a consultant</h2>
        <p className="text-muted">
          Offer your own sessions with this same email. You&apos;ll get a public profile and a dashboard; clients can book you once you&apos;ve set weekly hours.
        </p>
        <button onClick={() => setOpen(true)} className="rounded-sm bg-ink px-5 py-2.5 text-sm font-medium text-paper">
          Become a consultant
        </button>
      </section>
    );
  }

  return (
    <section className="profile-become-consultant space-y-4">
      <h2 className="font-display text-2xl font-semibold">Your consultant profile</h2>
      <p className="text-sm text-muted">
        This is what clients see, under your name{name ? ` (${name})` : ""} and time zone from above. You can change all of it later.
      </p>
      <form action={submit} className="profile-become-consultant-form grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Category
          <select name="category" className={field}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          Headline
          <input name="headline" required maxLength={120} placeholder="What you help with, in one line" className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          Bio
          <textarea name="bio" required maxLength={1000} rows={5} placeholder="Your experience and what a client leaves the session with" className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Price per session (USD)
          <input name="rate" type="number" required min={10} max={1000} step={5} defaultValue={100} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Session length
          <select name="slotMinutes" defaultValue={60} className={field}>
            <option value={30}>30 minutes</option>
            <option value={60}>60 minutes</option>
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
          <button className="rounded-sm bg-ink px-5 py-2.5 text-sm font-medium text-paper">Create consultant profile</button>
          <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted hover:text-ink">
            Not now
          </button>
          <Notice message={message} />
        </div>
      </form>
    </section>
  );
}
