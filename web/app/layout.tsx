import type { Metadata } from "next";
import {
  Bricolage_Grotesque,
  IBM_Plex_Sans,
  Instrument_Serif,
} from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import AccountNav from "./account-nav";
import DemoBar from "./demo-bar";
import SupportChat from "./support-chat";
import Toaster from "./toaster";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
});
const plex = IBM_Plex_Sans({
  variable: "--font-plex",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});
const instrument = Instrument_Serif({
  variable: "--font-instrument",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "Consultly",
  description: "Book and pay independent consultants in one step",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${bricolage.variable} ${plex.variable} ${instrument.variable} h-full antialiased`}
    >
      <body className="site-body flex min-h-full flex-col">
        <header className="site-header border-b border-rule">
          <nav className="site-header-nav mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-y-3 px-4 py-4 sm:py-5">
            <div className="site-header-brand flex items-baseline gap-4">
              <Link
                href="/"
                className="site-header-logo font-display text-xl font-semibold tracking-tight"
              >
                Consultly
              </Link>
              <span className="site-header-tagline hidden text-sm text-muted md:inline">
                Book and pay an expert in one step
              </span>
            </div>
            <div className="site-header-links flex w-full items-center justify-between gap-6 border-t border-rule pt-3 text-sm sm:w-auto sm:justify-end sm:border-0 sm:pt-0">
              <Link href="/consultants" className="site-header-consultants font-medium hover:underline">
                Find a consultant
              </Link>
              {/* usePathname() is runtime-only data, so it streams in behind Suspense. */}
              <Suspense
                fallback={<span className="block h-8 w-8" aria-hidden />}
              >
                <AccountNav />
              </Suspense>
            </div>
          </nav>
        </header>
        {/* usePathname() is runtime-only data, so the demo bar streams in behind Suspense too. */}
        <Suspense fallback={null}>
          <DemoBar />
        </Suspense>
        <main className="site-main mx-auto w-full max-w-5xl flex-1 px-4 py-10">
          {children}
        </main>
        {/* usePathname() is runtime-only data, so the Help bubble also streams in behind Suspense. */}
        <Suspense fallback={null}>
          <SupportChat />
        </Suspense>
        <Toaster />
        <footer className="site-footer mt-16 border-t border-rule">
          <div className="site-footer-columns mx-auto grid max-w-5xl gap-8 px-4 py-10 text-sm sm:grid-cols-[1fr_auto_auto] sm:gap-16">
            <div className="site-footer-brand space-y-2">
              <p className="font-display text-lg font-semibold">Consultly</p>
              <p className="max-w-xs text-muted">
                Book and pay an independent expert in one step.
              </p>
            </div>
            <nav aria-label="Company" className="site-footer-company flex flex-col gap-2">
              <Link href="/about" className="hover:underline">
                About
              </Link>
              <Link href="/how-it-works" className="hover:underline">
                How it works
              </Link>
              <Link href="/for-consultants" className="hover:underline">
                For consultants
              </Link>
              <Link href="/faq" className="hover:underline">
                FAQ
              </Link>
              <Link href="/contact" className="hover:underline">
                Contact
              </Link>
            </nav>
            <nav aria-label="Legal" className="site-footer-legal flex flex-col gap-2">
              <Link href="/terms" className="hover:underline">
                Terms
              </Link>
              <Link href="/privacy" className="hover:underline">
                Privacy
              </Link>
            </nav>
          </div>
          <p className="site-footer-legal-note mx-auto max-w-5xl px-4 pb-8 text-xs text-muted">
            © 2026 Consultly. Demo project; payments run in Stripe test mode.
          </p>
        </footer>
      </body>
    </html>
  );
}
