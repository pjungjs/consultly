"use client";

import { useEffect, useState } from "react";
import { apiFetch, type AvailabilitySnapshot, type WeeklyHours } from "@/lib/api";
import { cityFromZone, timeIn } from "@/lib/zone";

// Shown Sunday first; `iso` is the stored weekday (Luxon/ISO: Monday 1 … Sunday 7).
const WEEKDAYS = [
  { name: "Sunday", iso: 7 },
  { name: "Monday", iso: 1 },
  { name: "Tuesday", iso: 2 },
  { name: "Wednesday", iso: 3 },
  { name: "Thursday", iso: 4 },
  { name: "Friday", iso: 5 },
  { name: "Saturday", iso: 6 },
];

type Row = { on: boolean; startTime: string; endTime: string };

const toRows = (weekly: WeeklyHours[]): Row[] =>
  WEEKDAYS.map(({ iso }) => {
    const h = weekly.find((w) => w.weekday === iso);
    return h ? { on: true, startTime: h.startTime, endTime: h.endTime } : { on: false, startTime: "09:00", endTime: "17:00" };
  });

async function call(path: string, init?: RequestInit): Promise<AvailabilitySnapshot> {
  const res = await apiFetch(`/me/consultant/${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const body = await res.json();
  if (!res.ok) throw new Error(Array.isArray(body.message) ? body.message.join(", ") : (body.message ?? ""));
  return body;
}

// Weekly hours (the recurring rule) plus time off (the exceptions), in the consultant's own zone.
export default function AvailabilityEditor({ onChanged }: { onChanged: () => void }) {
  const [snap, setSnap] = useState<AvailabilitySnapshot | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    call("availability").then((s) => {
      setSnap(s);
      setRows(toRows(s.weekly));
    });
  }, []);

  function apply(s: AvailabilitySnapshot, text: string) {
    setSnap(s);
    setRows(toRows(s.weekly));
    setMessage({ kind: "ok", text });
    onChanged();
  }

  async function saveHours() {
    setSaving(true);
    setMessage(null);
    const weekly = rows.flatMap((r, i) => (r.on ? [{ weekday: WEEKDAYS[i].iso, startTime: r.startTime, endTime: r.endTime }] : []));
    try {
      apply(await call("availability", { method: "PUT", body: JSON.stringify({ weekly }) }), "Hours saved. Clients see the new times right away.");
    } catch (err) {
      setMessage({ kind: "error", text: (err as Error).message });
    }
    setSaving(false);
  }

  async function addTimeOff(form: FormData) {
    setMessage(null);
    try {
      const s = await call("time-off", {
        method: "POST",
        body: JSON.stringify({ from: form.get("from"), to: form.get("to") || form.get("from"), note: form.get("note") || undefined }),
      });
      apply(s, "Time off added. Those days are hidden from clients.");
    } catch (err) {
      setMessage({ kind: "error", text: (err as Error).message });
    }
  }

  async function removeTimeOff(id: string) {
    apply(await call(`time-off/${id}`, { method: "DELETE" }), "Time off removed.");
  }

  if (!snap) return <p className="text-muted">Loading your availability…</p>;

  const update = (i: number, patch: Partial<Row>) => setRows((cur) => cur.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const dateLabel = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

  return (
    <div className="availability-editor space-y-10">
      {message && (
        <p role={message.kind === "error" ? "alert" : "status"} className={`rounded-sm px-4 py-3 text-sm ${message.kind === "error" ? "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200" : "bg-sheet"}`}>
          {message.text}
        </p>
      )}

      {snap.conflicts.length > 0 && (
        <div className="availability-conflicts space-y-2 rounded-sm border border-highlight px-4 py-3 text-sm">
          <p className="font-medium">
            {snap.conflicts.length} booked session{snap.conflicts.length === 1 ? "" : "s"} fall outside your hours or during time off. They&apos;re kept; cancel them from Sessions if you can&apos;t make it.
          </p>
          <ul className="text-muted">
            {snap.conflicts.map((c) => (
              <li key={c.id}>
                {new Date(c.startsAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: snap.timezone })},{" "}
                {timeIn(c.startsAt, snap.timezone)} with {c.clientName}
              </li>
            ))}
          </ul>
        </div>
      )}

      <section className="availability-weekly-hours space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-2xl font-semibold">Weekly hours</h2>
          <p className="text-sm text-muted">In your time zone, {cityFromZone(snap.timezone)}</p>
        </div>
        <ul className="availability-weekly-list divide-y divide-rule border-y border-rule">
          {rows.map((r, i) => (
            <li key={WEEKDAYS[i].name} className="availability-weekday flex flex-wrap items-center gap-4 py-3">
              <label className="flex w-36 items-center gap-2 font-medium">
                <input type="checkbox" checked={r.on} onChange={(e) => update(i, { on: e.target.checked })} className="accent-[var(--ink)]" />
                {WEEKDAYS[i].name}
              </label>
              {r.on ? (
                <span className="flex items-center gap-2 text-sm">
                  <input type="time" step={1800} value={r.startTime} onChange={(e) => update(i, { startTime: e.target.value })} aria-label={`${WEEKDAYS[i].name} start`} className="rounded-sm border border-rule bg-sheet px-2 py-1" />
                  to
                  <input type="time" step={1800} value={r.endTime} onChange={(e) => update(i, { endTime: e.target.value })} aria-label={`${WEEKDAYS[i].name} end`} className="rounded-sm border border-rule bg-sheet px-2 py-1" />
                </span>
              ) : (
                <span className="text-sm text-muted">Unavailable</span>
              )}
            </li>
          ))}
        </ul>
        <button onClick={saveHours} disabled={saving} className="rounded-sm bg-ink px-5 py-2.5 text-sm font-medium text-paper disabled:opacity-40">
          {saving ? "Saving…" : "Save hours"}
        </button>
      </section>

      <section className="availability-time-off space-y-4">
        <h2 className="font-display text-2xl font-semibold">Time off</h2>
        {snap.timeOff.length === 0 ? (
          <p className="text-sm text-muted">No time off planned.</p>
        ) : (
          <ul className="availability-time-off-list divide-y divide-rule border-y border-rule">
            {snap.timeOff.map((t) => (
              <li key={t.id} className="availability-time-off-item flex flex-wrap items-baseline justify-between gap-2 py-3">
                <span>
                  <span className="font-medium">{t.from === t.to ? dateLabel(t.from) : `${dateLabel(t.from)} – ${dateLabel(t.to)}`}</span>
                  {t.note && <span className="text-muted"> · {t.note}</span>}
                </span>
                <button onClick={() => removeTimeOff(t.id)} className="text-sm underline">
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <form action={addTimeOff} className="availability-time-off-form flex flex-wrap items-end gap-3 text-sm">
          <label className="flex flex-col gap-1">
            From
            <input name="from" type="date" required className="rounded-sm border border-rule bg-sheet px-2 py-1.5" />
          </label>
          <label className="flex flex-col gap-1">
            To (optional)
            <input name="to" type="date" className="rounded-sm border border-rule bg-sheet px-2 py-1.5" />
          </label>
          <label className="flex flex-col gap-1">
            Note (optional)
            <input name="note" maxLength={80} placeholder="Holiday" className="w-48 rounded-sm border border-rule bg-sheet px-2 py-1.5" />
          </label>
          <button className="rounded-sm bg-ink px-4 py-2 font-medium text-paper">Add time off</button>
        </form>
      </section>
    </div>
  );
}
