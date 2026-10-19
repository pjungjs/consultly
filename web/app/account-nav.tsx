"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { API_URL, PROFILE_UPDATED, type Me } from "@/lib/api";

// One round button with your initial opens a small account menu; signed out, a plain "Sign in" link.
export default function AccountNav() {
  const [me, setMe] = useState<Me | null>(null);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = () =>
      fetch(`${API_URL}/me`, { credentials: "include", cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then(setMe)
        .catch(() => setMe(null));
    load();
    window.addEventListener(PROFILE_UPDATED, load);
    return () => window.removeEventListener(PROFILE_UPDATED, load);
  }, [pathname]);

  // Close on a click outside or Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!me) {
    return (
      <Link href="/my-bookings" className="account-nav-sign-in font-medium hover:underline">
        Sign in
      </Link>
    );
  }

  async function signOut() {
    setOpen(false);
    await fetch(`${API_URL}/auth/logout`, { method: "POST", credentials: "include" });
    setMe(null);
    router.push("/");
    router.refresh();
  }

  const initial = (me.name?.trim() || me.email)[0].toUpperCase();
  const item = (href: string) =>
    `block px-4 py-2 hover:bg-paper ${pathname.startsWith(href) ? "font-medium" : ""}`;

  return (
    <div ref={root} className="account-nav relative">
      <button
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="account-nav-button flex h-8 w-8 items-center justify-center rounded-full bg-ink font-medium text-paper hover:opacity-90"
      >
        {initial}
      </button>
      {open && (
        <div role="menu" className="account-nav-menu absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-sm border border-rule bg-sheet py-1 text-sm shadow-lg">
          <p className="truncate px-4 pt-2 pb-2 text-xs text-muted">{me.email}</p>
          <Link role="menuitem" href="/my-bookings" onClick={() => setOpen(false)} className={item("/my-bookings")}>
            My bookings
          </Link>
          {me.consultant && (
            <Link role="menuitem" href="/dashboard" onClick={() => setOpen(false)} className={item("/dashboard")}>
              Dashboard
            </Link>
          )}
          <Link role="menuitem" href="/profile" onClick={() => setOpen(false)} className={item("/profile")}>
            Profile
          </Link>
          <button role="menuitem" onClick={signOut} className="block w-full border-t border-rule px-4 py-2 text-left hover:bg-paper">
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
