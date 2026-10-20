import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { api } from "@/lib/api";
import { LinkedText } from "@/lib/site-links";
import LoadingNote from "../loading-note";

export const metadata: Metadata = { title: "FAQ · Consultly" };

type Topic = { title: string; answer: string };

// The same topics the Help assistant answers from (served by the AI service), so the FAQ and the assistant can't disagree.
async function Topics() {
  let topics: Topic[];
  try {
    topics = await api<Topic[]>("/support/topics");
  } catch {
    return (
      <p className="text-muted">
        The FAQ can&apos;t be loaded right now. Try the Help button, or{" "}
        <Link href="/contact" className="underline">
          contact us
        </Link>
        .
      </p>
    );
  }
  return (
    <div className="faq-topics divide-y divide-rule border-y border-rule">
      {topics.map((t) => (
        <details key={t.title} className="faq-topic group py-4">
          <summary className="flex cursor-pointer list-none items-baseline justify-between gap-4 font-display text-xl font-semibold">
            {t.title}
            <span aria-hidden className="text-muted transition-transform group-open:rotate-45">
              +
            </span>
          </summary>
          <p className="mt-3 max-w-2xl leading-relaxed text-muted">
            <LinkedText text={t.answer} />
          </p>
        </details>
      ))}
    </div>
  );
}

export default function FaqPage() {
  return (
    <article className="faq-page max-w-3xl space-y-8">
      <div className="space-y-3">
        <h1 className="font-serif text-5xl leading-tight">Frequently asked questions</h1>
        <p className="text-lg text-muted">Booking, cancelling, refunds, briefs and accounts. Can&apos;t find it? Ask the Help button in the corner.</p>
      </div>
      <Suspense fallback={<LoadingNote />}>
        <Topics />
      </Suspense>
    </article>
  );
}
