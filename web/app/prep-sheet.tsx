import type { Brief, PrepSheet as Sheet } from "@/lib/api";

const MODEL_NAMES: Record<string, string> = {
  "claude-haiku-5-5": "Claude Haiku 5.5",
  "claude-sonnet-5-5": "Claude Sonnet 5.5",
  "claude-opus-5-5": "Claude Opus 5.5",
};

/** Where the summary came from, said plainly: AI output should never pass as the client's own words. */
export function summarySource(brief: Pick<Brief, "source" | "model">) {
  if (brief.source === "SAMPLE") return "Sample summary, written for the demo";
  return `Summarised by ${MODEL_NAMES[brief.model ?? ""] ?? "AI"} · check details against the original`;
}

function List({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <section className="prep-sheet-list space-y-1.5">
      <h4 className="font-display font-semibold">{title}</h4>
      <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed marker:text-muted">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

// The consultant's two-minute read before a session; clients see the same sheet so they can catch a misread.
export default function PrepSheet({ sheet }: { sheet: Sheet }) {
  return (
    <div className="prep-sheet space-y-5">
      <p className="prep-sheet-one-liner font-serif text-2xl leading-snug">{sheet.one_liner}</p>
      <p className="prep-sheet-background text-sm leading-relaxed text-muted">{sheet.background}</p>
      <div className="grid gap-5 sm:grid-cols-2">
        <List title="Goals" items={sheet.goals} />
        <List title="Key facts" items={sheet.key_facts} />
        <List title="Questions to answer" items={sheet.questions} />
        <List title="Gaps to ask about" items={sheet.gaps} />
      </div>
      {sheet.agenda.length > 0 && (
        <section className="prep-sheet-agenda space-y-1.5">
          <h4 className="font-display font-semibold">Suggested agenda</h4>
          <ol className="divide-y divide-rule border-y border-rule text-sm">
            {sheet.agenda.map((item, i) => (
              <li key={i} className="grid grid-cols-[4rem_1fr] gap-3 py-2">
                <span className="text-muted">{item.minutes} min</span>
                <span>{item.topic}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
