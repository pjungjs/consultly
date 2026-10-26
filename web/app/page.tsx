import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { api, CATEGORIES, formatPrice, type Consultant } from "@/lib/api";
import { monogram } from "@/lib/monogram";
import { cityFromZone } from "@/lib/zone";
import TestimonialCarousel from "./testimonial-carousel";
import myBookingsShot from "../public/screenshots/my-bookings.png";
import prepSheetShot from "../public/screenshots/prep-sheet.png";
import timePickerShot from "../public/screenshots/time-picker.png";
import LoadingNote from "./loading-note";

const STEPS = [
  { title: "Pick a time", body: "Every consultant's open hours are shown in your own time zone. Choose one session or a few." },
  { title: "Pay once", body: "Checkout runs on Stripe. Your times are held for 30 minutes while you pay, so nobody takes them." },
  { title: "Meet", body: "You get a confirmation email with a calendar invite. Your bookings are always under My bookings." },
];

// One consultant from each of the first three categories, so the teaser shows range.
async function Featured() {
  const consultants = await api<Consultant[]>("/consultants");
  const featured = CATEGORIES.slice(0, 3).flatMap((cat) => consultants.find((c) => c.category === cat) ?? []);
  return (
    <ul className="landing-featured-list grid gap-4 sm:grid-cols-3">
      {featured.map((c) => {
        const { initials, colour } = monogram(c.name);
        return (
          <li key={c.id} className="landing-featured-item">
            <Link href={`/consultants/${c.id}`} className="landing-featured-card flex h-full flex-col gap-4 rounded-sm bg-sheet p-5 hover:outline hover:outline-rule">
              <div className="flex h-14 w-14 items-center justify-center rounded-sm font-serif text-2xl text-white" style={{ backgroundColor: colour }} aria-hidden>
                {initials}
              </div>
              <div className="flex-1">
                <p className="font-serif text-2xl leading-tight">{c.name}</p>
                <p className="mt-1 text-sm">{c.headline}</p>
              </div>
              <p className="text-sm text-muted">
                {c.category}, in {cityFromZone(c.timezone)} · <span className="text-ink">{formatPrice(c.rateCents)}</span> · {c.slotMinutes} min
              </p>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

// The intro; the full catalogue with search and filters is at /consultants.
export default function Home() {
  return (
    <div className="landing-page space-y-28 sm:space-y-36">
      <section className="landing-hero space-y-6 pt-4">
        <h1 className="max-w-3xl font-display text-5xl font-semibold leading-[1.05] tracking-tight sm:text-7xl">
          Book time with someone who has done it before.
        </h1>
        <p className="max-w-xl text-lg text-muted">
          Consultly connects you with independent experts in strategy, tech, design, finance and contracts. See their real open hours, pay once, and get on a call.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/consultants" className="rounded-sm bg-ink px-6 py-3 font-medium text-paper">
            Browse consultants
          </Link>
          <Link href="/how-it-works" className="font-medium underline">
            How booking works
          </Link>
        </div>
      </section>

      <section className="landing-steps space-y-6">
        <h2 className="font-display text-3xl font-semibold tracking-tight">Three steps to a booked call</h2>
        <ol className="landing-steps-list grid gap-8 border-t border-rule pt-6 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="landing-step space-y-2">
              <p className="font-serif text-5xl leading-none">
                <span className="bg-highlight px-1 text-on-highlight">{i + 1}</span>
              </p>
              <h3 className="font-display text-xl font-semibold">{step.title}</h3>
              <p className="text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="landing-featured space-y-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-display text-3xl font-semibold tracking-tight">A few of our consultants</h2>
          <Link href="/consultants" className="font-medium underline">
            See all consultants
          </Link>
        </div>
        <Suspense fallback={<LoadingNote label="Loading consultants…" />}>
          <Featured />
        </Suspense>
      </section>

      <section className="landing-testimonials space-y-6">
        <h2 className="font-display text-3xl font-semibold tracking-tight">What clients say</h2>
        <TestimonialCarousel />
      </section>

      <section className="landing-showcase space-y-6 rounded-sm bg-band px-5 py-8 sm:px-8 sm:py-10">
        <h2 className="font-display text-3xl font-semibold tracking-tight">See it in action</h2>
        <figure className="landing-showcase-item space-y-3">
          <Image src={timePickerShot} alt="A consultant's week of open times, with two sessions selected and a total of $400" className="rounded-sm border border-rule bg-sheet shadow-sm" />
          <figcaption className="text-sm text-muted">Pick several times in your own time zone and pay once. Times are held while you check out.</figcaption>
        </figure>
        <div className="grid gap-8 sm:grid-cols-2">
          <figure className="landing-showcase-item space-y-3">
            <Image src={prepSheetShot} alt="An AI prep sheet: a one-line summary, background, goals and key facts from the client's PDF" className="rounded-sm border border-rule bg-sheet shadow-sm" />
            <figcaption className="text-sm text-muted">Attach a PDF brief and your consultant gets a one-page prep sheet. You see the same sheet.</figcaption>
          </figure>
          <figure className="landing-showcase-item space-y-3">
            <Image src={myBookingsShot} alt="My bookings: a week calendar and a list of sessions with receipts, briefs and cancel options" className="rounded-sm border border-rule bg-sheet shadow-sm" />
            <figcaption className="text-sm text-muted">Every session in one place. Cancel free up to 24 hours before, with an automatic refund.</figcaption>
          </figure>
        </div>
      </section>

      <section className="landing-for-consultants grid gap-6 rounded-sm bg-ink px-6 py-10 text-paper sm:grid-cols-[1fr_auto] sm:items-center sm:px-10">
        <div className="space-y-2">
          <h2 className="font-display text-3xl font-semibold tracking-tight">Are you a consultant?</h2>
          <p className="max-w-lg opacity-80">
            Set your weekly hours, get booked and paid up front, and see every session on one dashboard.
          </p>
        </div>
        <Link href="/for-consultants" className="justify-self-start rounded-sm bg-highlight px-6 py-3 font-medium text-on-highlight">
          Learn about consulting here
        </Link>
      </section>
    </div>
  );
}
