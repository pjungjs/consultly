// Shared layout for the footer's template pages. Replace the copy before launch.
export default function InfoPage({ title, intro, sections }: { title: string; intro: string; sections: { heading: string; body: string }[] }) {
  return (
    <article className="info-page max-w-2xl space-y-8">
      <div className="space-y-3">
        <h1 className="font-serif text-5xl leading-tight">{title}</h1>
        <p className="text-lg text-muted">{intro}</p>
      </div>
      {sections.map((s) => (
        <section key={s.heading} className="info-page-section space-y-2">
          <h2 className="font-display text-xl font-semibold">{s.heading}</h2>
          <p className="leading-relaxed">{s.body}</p>
        </section>
      ))}
    </article>
  );
}
