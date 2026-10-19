"use client";

import { useEffect, useRef, useState } from "react";

// Sample quotes for the demo; swap in real client reviews before launch.
const TESTIMONIALS = [
  {
    quote: "One hour with Kenji and I finally understood our runway. We changed our hiring plan the same week.",
    name: "Dana",
    role: "Founder, seed-stage SaaS",
  },
  {
    quote: "I booked three sessions at once with Jason for a system-design review. Paying once and getting one invite made it painless.",
    name: "Marco",
    role: "Engineering lead",
  },
  {
    quote: "Sora read my contract line by line and found two clauses I'd never have caught. Worth every minute.",
    name: "Aisha",
    role: "Freelance illustrator",
  },
  {
    quote: "Priya tore my pitch deck apart in the kindest way. Two weeks later we closed our pre-seed round.",
    name: "Liam",
    role: "Co-founder, climate startup",
  },
  {
    quote: "Lucas recorded a live audit of our onboarding. We shipped his top three fixes and sign-ups went up the next month.",
    name: "Sofia",
    role: "Product manager",
  },
  {
    quote: "Seeing every consultant's hours in my own time zone meant I booked Tokyo from Toronto without doing any maths.",
    name: "Noah",
    role: "Independent developer",
  },
];

// Scroll-snap track: swipe on touch screens, Previous/Next everywhere. 3 quotes per page on wide screens, 1 on phones.
export default function TestimonialCarousel() {
  const track = useRef<HTMLUListElement>(null);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(2);

  function measure() {
    const el = track.current;
    // Mid-resize (e.g. switching to a mobile view) the track can be 0px wide; dividing by it gives Infinity/NaN.
    if (!el || el.clientWidth === 0) return;
    const count = Math.min(TESTIMONIALS.length, Math.max(1, Math.round(el.scrollWidth / el.clientWidth)));
    setPages(count);
    setPage(Math.min(count - 1, Math.max(0, Math.round(el.scrollLeft / el.clientWidth))));
  }

  // Page count depends on the screen width (3 per page or 1), so re-measure on resize.
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  function go(to: number) {
    const el = track.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left: to * el.clientWidth, behavior: reduce ? "auto" : "smooth" });
  }

  return (
    <div className="testimonial-carousel space-y-6 border-t border-rule pt-6">
      <ul
        ref={track}
        onScroll={measure}
        className="testimonial-carousel-track flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none]"
        aria-label="Client testimonials"
      >
        {TESTIMONIALS.map((t) => (
          <li key={t.name} className="testimonial-carousel-item w-full shrink-0 snap-start overflow-hidden pr-8 sm:w-1/3">
            <figure className="space-y-4">
              <blockquote className="font-serif text-2xl leading-snug">&ldquo;{t.quote}&rdquo;</blockquote>
              <figcaption className="text-sm">
                <span className="font-medium">{t.name}</span>
                <span className="text-muted">, {t.role}</span>
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
      <div className="testimonial-carousel-controls flex items-center justify-between gap-3 text-sm">
        <div className="testimonial-carousel-dots flex">
          {Array.from({ length: pages }, (_, i) => (
            // The bar is small; the button around it gives a comfortable tap target.
            <button key={i} onClick={() => go(i)} aria-label={`Show page ${i + 1}`} aria-current={i === page} className="group px-1 py-3">
              <span className={`block h-1.5 w-6 rounded-sm ${i === page ? "bg-ink" : "bg-rule group-hover:bg-muted"}`} />
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <span className="sr-only" aria-live="polite">
            Page {page + 1} of {pages}
          </span>
          <button onClick={() => go(page - 1)} disabled={page === 0} className="rounded-sm px-3 py-1.5 hover:bg-sheet disabled:opacity-40">
            Previous
          </button>
          <button onClick={() => go(page + 1)} disabled={page >= pages - 1} className="rounded-sm px-3 py-1.5 hover:bg-sheet disabled:opacity-40">
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
