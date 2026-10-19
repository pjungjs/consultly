import Link from "next/link";

/** The "nothing here" message, shared by the site-wide 404 page and pages that look something up by id. */
export default function NotFoundMessage({ title, body }: { title: string; body: string }) {
  return (
    <div className="not-found max-w-xl space-y-5 py-8">
      <p className="font-serif text-7xl leading-none text-muted">404</p>
      <h1 className="font-display text-4xl font-semibold tracking-tight">{title}</h1>
      <p className="text-muted">{body}</p>
      <div className="flex flex-wrap gap-3">
        <Link href="/consultants" className="rounded-sm bg-ink px-5 py-2.5 text-sm font-medium text-paper">
          Find a consultant
        </Link>
        <Link href="/" className="px-2 py-2.5 text-sm text-muted hover:text-ink">
          Go to the home page
        </Link>
      </div>
    </div>
  );
}
