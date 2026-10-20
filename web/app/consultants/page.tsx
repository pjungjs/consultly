import { Suspense } from "react";
import { api, type Consultant, type SlotList } from "@/lib/api";
import DemoConsultantCard from "./demo-consultant-card";
import PlannerList from "./planner-list";
import LoadingNote from "../loading-note";

// Live availability: streamed inside <Suspense> so the static heading renders instantly.
async function Planner() {
  const consultants = await api<Consultant[]>("/consultants");
  const withSlots = await Promise.all(
    consultants.map(async (c) => ({
      ...c,
      slots: (await api<SlotList>(`/consultants/${c.id}/slots`)).slots,
    })),
  );
  return <PlannerList consultants={withSlots} />;
}

// The full catalogue with search and filters; the intro lives at "/".
export default function ConsultantsPage() {
  return (
    <div className="consultants-page space-y-10">
      <h1 className="max-w-xl font-display text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
        Find your consultant
      </h1>
      <DemoConsultantCard />
      <Suspense fallback={<LoadingNote label="Loading open hours…" />}>
        <Planner />
      </Suspense>
    </div>
  );
}
