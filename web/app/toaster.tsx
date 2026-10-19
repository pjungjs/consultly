"use client";

import { useEffect, useRef, useState } from "react";
import { TOAST_EVENT } from "@/lib/api";

const SHOW_MS = 6000;
type Toast = { id: number; message: string };

/**
 * Error toasts for unexpected failures (see apiFetch). Bottom left, clear of the Help bubble on the right.
 * The same message isn't stacked twice: several calls failing together show one toast.
 */
export default function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  useEffect(() => {
    const onToast = (e: Event) => {
      const message = (e as CustomEvent<string>).detail;
      const id = ++nextId.current;
      setToasts((cur) => (cur.some((t) => t.message === message) ? cur : [...cur, { id, message }]));
      setTimeout(() => setToasts((cur) => cur.filter((t) => t.id !== id)), SHOW_MS);
    };
    window.addEventListener(TOAST_EVENT, onToast);
    return () => window.removeEventListener(TOAST_EVENT, onToast);
  }, []);

  return (
    // Always in the page, so screen readers announce each toast as it's added.
    <div aria-live="assertive" className="toaster fixed bottom-4 left-4 right-20 z-40 flex flex-col gap-2 sm:right-auto sm:w-96">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="alert"
          className="toast flex items-start gap-3 rounded-sm border border-red-700/30 bg-sheet px-4 py-3 text-sm shadow-lg motion-safe:animate-[toast-in_200ms_ease-out] dark:border-red-400/40"
        >
          <span aria-hidden className="font-semibold text-red-700 dark:text-red-400">
            !
          </span>
          <p className="flex-1">{t.message}</p>
          <button
            onClick={() => setToasts((cur) => cur.filter((x) => x.id !== t.id))}
            aria-label="Dismiss"
            className="-my-1 -mr-1 px-1 text-muted hover:text-ink"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
