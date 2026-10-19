import Link from "next/link";
import { Suspense } from "react";
import { api, formatPrice, type Consultant, type SlotList } from "@/lib/api";
import { monogram } from "@/lib/monogram";
import LocalClock from "./local-clock";
import SlotPicker from "./slot-picker";

async function Studio({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [consultant, slotList] = await Promise.all([
    api<Consultant>(`/consultants/${id}`),
    api<SlotList>(`/consultants/${id}/slots`),
  ]);
  const { initials, colour } = monogram(consultant.name);

  return (
    <>
      <section className="profile-hero grid gap-8 sm:grid-cols-[11rem_1fr] sm:gap-12">
        <div
          className="flex aspect-square w-32 items-center justify-center rounded-sm font-serif text-6xl text-white sm:w-44 sm:text-7xl"
          style={{ backgroundColor: colour }}
          aria-hidden
        >
          {initials}
        </div>
        <div className="profile-details max-w-2xl">
          <h1 className="font-serif text-5xl leading-none sm:text-7xl">{consultant.name}</h1>
          <p className="mt-4 text-lg">{consultant.headline}</p>
          <div className="mt-1">
            <LocalClock timezone={consultant.timezone} />
          </div>
          <p className="mt-6 leading-relaxed text-muted">{consultant.bio}</p>
          <p className="mt-6">
            <span className="font-serif text-3xl">{formatPrice(consultant.rateCents)}</span>
            <span className="text-muted"> for {consultant.slotMinutes} minutes</span>
          </p>
        </div>
      </section>
      <SlotPicker consultant={consultant} slots={slotList.slots} />
    </>
  );
}

export default function ConsultantPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div className="profile-page flex flex-col gap-14">
      <Link href="/consultants" className="self-start text-sm text-muted hover:text-ink">
        <span aria-hidden>←</span> All consultants
      </Link>
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Studio params={params} />
      </Suspense>
    </div>
  );
}
