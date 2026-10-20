import { NextResponse, type NextRequest } from "next/server";

/**
 * Real 404s for unknown consultant links. The profile page streams (its frame goes out before the consultant is
 * loaded), so by the time it finds out the consultant doesn't exist, a 200 status has already been sent. This
 * runs first, asks the API, and sends unknown ones to the site's 404 page with a 404 status.
 */
export async function proxy(request: NextRequest) {
  const id = request.nextUrl.pathname.split("/")[2];
  const api = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
  try {
    const res = await fetch(`${api}/consultants/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(90_000) });
    // No such route exists, so Next.js renders the site's not-found page, with a 404 status.
    if (res.status === 404) return NextResponse.rewrite(new URL("/consultant-not-found", request.url));
  } catch {
    // API unreachable: carry on, and the page shows its own "couldn't load" screen.
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    {
      source: "/consultants/:id",
      // Not for link prefetches (the browser loading profiles ahead of a click): only real visits.
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
