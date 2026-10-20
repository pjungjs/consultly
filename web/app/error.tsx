"use client"; // error pages must run in the browser

import Link from "next/link";
import { useEffect } from "react";

/**
 * Shown when a page can't load its data: usually the API is waking up (free hosting sleeps when idle) or is
 * briefly down. Says so plainly and offers a retry instead of a blank or broken page.
 */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error); // visible in the browser console for debugging
  }, [error]);

  return (
    <div className="error-page max-w-xl space-y-4">
      <h1 className="font-display text-4xl font-semibold tracking-tight">This page couldn&apos;t load</h1>
      <p className="text-muted">
        The server may be starting up from sleep mode, or be briefly unavailable. Please try again in a minute.
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <button onClick={() => retry()} className="rounded-sm bg-ink px-5 py-2.5 text-sm font-medium text-paper">
          Try again
        </button>
        <Link href="/" className="text-sm text-muted hover:text-ink">
          Go to the home page
        </Link>
      </div>
    </div>
  );
}
