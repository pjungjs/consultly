"use client";

import { useEffect, useState } from "react";
import { API_URL, apiFetch, type Brief } from "@/lib/api";
import PrepSheet, { summarySource } from "./prep-sheet";

/** Read-only brief for the consultant's dashboard: fetched when the row is opened. */
export default function BriefView({ orderId }: { orderId: string }) {
  const [brief, setBrief] = useState<Brief | null | undefined>(undefined);

  useEffect(() => {
    apiFetch(`/me/orders/${orderId}/brief`, { credentials: "include", cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { brief: null }))
      .then((body) => setBrief(body.brief))
      .catch(() => setBrief(null));
  }, [orderId]);

  if (brief === undefined) return <p className="text-sm text-muted">Loading the brief…</p>;
  if (brief === null) return <p className="text-sm text-muted">No brief for this session.</p>;
  return <BriefBody orderId={orderId} brief={brief} />;
}

/** Summary (or why there isn't one) plus a link to the original PDF. Shared by both sides. */
export function BriefBody({ orderId, brief }: { orderId: string; brief: Brief }) {
  return (
    <div className="brief-body space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="text-muted">{brief.summary ? summarySource(brief) : "No summary"}</span>
        <a href={`${API_URL}/me/orders/${orderId}/brief/file`} target="_blank" rel="noreferrer" className="underline">
          Open original PDF ({brief.filename})
        </a>
      </div>
      {brief.summary ? <PrepSheet sheet={brief.summary} /> : <p className="rounded-sm bg-paper px-3 py-2 text-sm">{brief.message}</p>}
    </div>
  );
}
