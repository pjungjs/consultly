"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch, wakeAssistant, type Brief } from "@/lib/api";
import { BriefBody } from "./brief-view";

type State = { kind: "loading" } | { kind: "signed-out" } | { kind: "ready"; brief: Brief | null; canEdit: boolean };

/** On the booking page: the client adds a PDF brief before the session and sees the prep sheet the consultant will read. */
export default function BriefPanel({ orderId }: { orderId: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);

  useEffect(() => {
    apiFetch(`/me/orders/${orderId}/brief`, { credentials: "include", cache: "no-store" })
      .then(async (res) => (res.status === 401 || res.status === 404 ? { kind: "signed-out" as const } : { kind: "ready" as const, ...(await res.json()) }))
      .then((next) => {
        // They can add a brief: start the AI service now, so their upload doesn't wait for it to wake.
        if (next.kind === "ready" && next.canEdit) wakeAssistant();
        setState(next);
      })
      .catch(() => setState({ kind: "signed-out" }));
  }, [orderId]);

  async function send(method: "POST" | "DELETE", body?: FormData) {
    setBusy(method === "POST" ? "upload" : "remove");
    setError(null);
    const res = await apiFetch(`/me/orders/${orderId}/brief`, { method, body, credentials: "include" });
    const json = await res.json();
    setBusy(null);
    if (!res.ok) return setError(res.status === 413 ? "Briefs can be at most 10 MB." : Array.isArray(json.message) ? json.message.join(", ") : (json.message ?? ""));
    setReplacing(false);
    setState({ kind: "ready", ...json });
  }

  if (state.kind === "loading") return null;
  if (state.kind === "signed-out") {
    return (
      <section id="brief" className="brief-panel space-y-2 border-t border-rule pt-8">
        <h2 className="font-display text-2xl font-semibold">Brief for your consultant</h2>
        <p className="text-sm text-muted">
          <Link href="/my-bookings" className="underline">
            Sign in
          </Link>{" "}
          with the email you booked with to add a PDF brief.
        </p>
      </section>
    );
  }

  const { brief, canEdit } = state;
  const showForm = canEdit && (!brief || replacing);
  return (
    <section id="brief" className="brief-panel space-y-4 border-t border-rule pt-8">
      <div className="space-y-1">
        <h2 className="font-display text-2xl font-semibold">Brief for your consultant</h2>
        <p className="text-sm text-muted">
          {brief
            ? "Your consultant sees this summary and can open the original. If anything is wrong, upload a corrected PDF."
            : "Attach a PDF about your situation (a deck, spec, contract or notes). We turn it into a one-page prep sheet so the session starts informed."}
        </p>
      </div>
      {brief && <BriefBody orderId={orderId} brief={brief} />}
      {busy === "upload" && (
        <div role="status" className="brief-processing flex items-center gap-3 rounded-sm bg-sheet px-4 py-4 text-sm">
          <span aria-hidden className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-rule border-t-ink motion-reduce:animate-none" />
          <span>
            <span className="font-medium">Reading your brief and writing the prep sheet…</span>
            <span className="block text-muted">This usually takes 10 to 20 seconds. You can stay on this page.</span>
          </span>
        </div>
      )}
      {showForm && busy !== "upload" && (
        <form
          // onSubmit, not a form action: React draws state set inside a form action only after it finishes,
          // so the "processing" panel would never appear while the AI is working.
          onSubmit={(e) => {
            e.preventDefault();
            send("POST", new FormData(e.currentTarget));
          }}
          className="brief-upload-form flex flex-wrap items-center gap-3 rounded-sm border border-dashed border-rule px-4 py-4 text-sm"
        >
          <input name="file" type="file" accept="application/pdf" required className="max-w-full text-sm file:mr-3 file:rounded-sm file:border-0 file:bg-sheet file:px-3 file:py-1.5" />
          <button disabled={busy !== null} className="rounded-sm bg-ink px-4 py-2 font-medium text-paper disabled:opacity-40">
            {brief ? "Replace brief" : "Upload brief"}
          </button>
          {replacing && (
            <button type="button" onClick={() => setReplacing(false)} className="text-muted hover:text-ink">
              Keep current brief
            </button>
          )}
          <p className="basis-full text-xs text-muted">PDF, up to 10 MB and 30 pages. The text is sent to an AI service to write the summary.</p>
        </form>
      )}
      {brief && canEdit && !replacing && (
        <div className="flex gap-4 text-sm">
          <button onClick={() => setReplacing(true)} className="underline">
            Replace PDF
          </button>
          <button onClick={() => send("DELETE")} disabled={busy !== null} className="text-muted underline hover:text-ink disabled:opacity-40">
            {busy === "remove" ? "Removing…" : "Remove brief"}
          </button>
        </div>
      )}
      {!canEdit && !brief && <p className="text-sm text-muted">Briefs can be added until your session starts.</p>}
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </section>
  );
}
