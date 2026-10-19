"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { LinkedText } from "@/lib/site-links";

type Mode = "ai" | "demo";
type Message = { role: "user" | "assistant"; content: string; demo?: boolean; model?: string | null; notice?: string | null };

const STORAGE_KEY = "consultly-help"; // sessionStorage: the conversation lasts as long as the tab
const MODE_KEY = "consultly-help-mode"; // localStorage: this browser's Live AI / Demo choice
// While developing, each Live AI answer shows which model wrote it.
const SHOW_MODEL = process.env.NODE_ENV !== "production";
const STARTERS = ["How do refunds work?", "When is my next session?", "How do I add a brief?"];

function readMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === "ai" ? "ai" : "demo";
  } catch {
    return "demo";
  }
}

function readHistory(): Message[] {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

// The Help bubble: answers from the help pages and, when signed in, the user's own bookings (read-only).
export default function SupportChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Demo by default: Live AI calls the Claude API, which costs money per answer.
  const [mode, setMode] = useState<Mode>("demo");
  const pathname = usePathname();
  const input = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  // A consultant's profile has a sticky checkout bar at the bottom; sit above it.
  const raised = /^\/consultants\/[^/]+$/.test(pathname);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  function toggle() {
    // Restore the tab's conversation on first open (sessionStorage only exists in the browser, so not during render).
    if (!open && messages.length === 0) setMessages(readHistory());
    if (!open) setMode(readMode());
    setOpen(!open);
  }

  function chooseMode(next: Mode) {
    setMode(next);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {}
  }

  useEffect(() => {
    try {
      if (messages.length) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      // storage unavailable (private mode): the chat still works, it just won't survive a reload
    }
    end.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setDraft("");
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(`/support/chat`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Only the last 20 messages travel; older ones are still shown here.
          messages: next.slice(-20).map(({ role, content }) => ({ role, content })),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          mode,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(Array.isArray(body.message) ? body.message.join(", ") : (body.message ?? ""));
      setMessages([...next, { role: "assistant", content: body.reply, demo: body.mode === "demo", model: body.model, notice: body.notice }]);
    } catch (err) {
      setError((err as Error).message || null); // empty: a toast already said what went wrong
    }
    setBusy(false);
  }

  function newChat() {
    setMessages([]);
    setError(null);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {}
  }

  return (
    <div className={`support-chat fixed right-4 z-30 ${raised ? "bottom-28" : "bottom-4"}`}>
      {open && (
        <section
          role="dialog"
          aria-label="Help"
          className="support-chat-panel absolute right-0 bottom-14 flex h-[min(32rem,calc(100dvh-8rem))] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-sm border border-rule bg-paper shadow-xl"
        >
          <header className="support-chat-header flex items-center justify-between border-b border-rule px-4 py-3">
            <div className="flex items-center gap-3">
              <h2 className="font-display font-semibold">Help</h2>
              <div role="group" aria-label="Answer mode" className="support-chat-mode flex w-fit rounded-sm bg-sheet p-0.5 text-xs">
                {(["demo", "ai"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => chooseMode(m)}
                    aria-pressed={mode === m}
                    title={m === "ai" ? "Answers from Claude (uses the API)" : "Pre-written answers, no API calls"}
                    className={`rounded-sm px-2 py-0.5 ${mode === m ? "bg-ink text-paper" : "text-muted hover:text-ink"}`}
                  >
                    {m === "ai" ? "Live AI" : "Demo"}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1 text-sm">
              {messages.length > 0 && (
                <button onClick={newChat} className="rounded-sm px-2 py-1 whitespace-nowrap text-muted hover:bg-sheet hover:text-ink">
                  New chat
                </button>
              )}
              <button onClick={() => setOpen(false)} aria-label="Close help" className="rounded-sm px-2 py-1 text-lg leading-none hover:bg-sheet">
                ×
              </button>
            </div>
          </header>
          <div className="support-chat-messages flex-1 space-y-3 overflow-y-auto px-4 py-4 text-sm" aria-live="polite">
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-muted">
                  Ask anything about booking, cancelling, refunds, briefs or your own sessions, or{" "}
                  <Link href="/faq" onClick={() => setOpen(false)} className="underline">
                    browse the FAQ
                  </Link>
                  .
                </p>
                <div className="flex flex-wrap gap-2">
                  {STARTERS.map((s) => (
                    <button key={s} onClick={() => send(s)} className="rounded-sm bg-sheet px-3 py-1.5 text-left hover:bg-rule/60">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) =>
              m.role === "user" ? (
                <p key={i} className="support-chat-user ml-8 rounded-sm bg-ink px-3 py-2 whitespace-pre-wrap text-paper">
                  {m.content}
                </p>
              ) : (
                <div key={i} className="support-chat-assistant mr-6 space-y-1">
                  {m.notice && (
                    // Why Live AI didn't answer (signed out, daily limit, no key): highlighted so it isn't missed.
                    <p role="note" className="support-chat-notice w-fit rounded-sm bg-highlight px-2 py-1 text-xs font-medium text-on-highlight">
                      {m.notice}
                    </p>
                  )}
                  {m.demo && !m.notice && <p className="text-xs text-muted">Demo answer</p>}
                  {!m.demo && SHOW_MODEL && m.model && <p className="support-chat-model text-xs text-muted">Live AI · {m.model}</p>}
                  <p className="rounded-sm bg-sheet px-3 py-2 whitespace-pre-wrap">
                    <LinkedText text={m.content} onNavigate={() => setOpen(false)} />
                  </p>
                </div>
              ),
            )}
            {busy && <p className="mr-6 w-fit rounded-sm bg-sheet px-3 py-2 text-muted">Thinking…</p>}
            {error && (
              <p role="alert" className="text-red-700 dark:text-red-400">
                {error}
              </p>
            )}
            <div ref={end} />
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
            className="support-chat-form flex items-end gap-2 border-t border-rule px-3 py-3"
          >
            <textarea
              ref={input}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(draft);
                }
              }}
              rows={1}
              maxLength={2000}
              placeholder="Ask a question"
              aria-label="Your question"
              className="max-h-28 min-h-9 flex-1 resize-none rounded-sm border border-rule bg-sheet px-3 py-2 text-sm"
            />
            <button disabled={busy || !draft.trim()} className="rounded-sm bg-ink px-3 py-2 text-sm font-medium text-paper disabled:opacity-40">
              Send
            </button>
          </form>
        </section>
      )}
      <button
        onClick={toggle}
        aria-expanded={open}
        aria-label={open ? "Close help" : "Open help"}
        className="support-chat-button flex h-12 items-center gap-2 rounded-full bg-ink px-5 font-medium text-paper shadow-lg hover:opacity-90"
      >
        {open ? "Close" : "Help"}
      </button>
    </div>
  );
}
