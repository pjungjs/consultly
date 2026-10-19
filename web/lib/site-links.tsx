import Link from "next/link";
import { Fragment } from "react";

// Site paths in help text (FAQ answers, Help replies) become links; nothing else in the text is treated as markup.
const PATHS = /(\/(?:my-bookings|profile|dashboard|consultants|contact|how-it-works|for-consultants|faq)\b)/g;

export function LinkedText({ text, onNavigate }: { text: string; onNavigate?: () => void }) {
  return text.split(PATHS).map((part, i) =>
    i % 2 === 1 ? (
      <Link key={i} href={part} onClick={onNavigate} className="underline">
        {part}
      </Link>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}
