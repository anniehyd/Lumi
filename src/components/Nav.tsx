"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

const links = [
  { href: "/dashboard", label: "Today" },
  { href: "/calendar", label: "Calendar" },
  { href: "/settings", label: "Settings" },
];

/**
 * Top bar. `pendingCount` lets the dashboard show how many untouched cards
 * are waiting as the primary pill, and `maybeCount` how many are parked as
 * Maybe; other pages leave both off.
 */
export function Nav({ pendingCount, maybeCount }: { pendingCount?: number; maybeCount?: number } = {}) {
  const pathname = usePathname();
  const { data: session } = useSession();
  // No signed-in user means demo mode; never show a real address as a stand-in.
  const userEmail = session?.user?.email ?? "Demo";
  const userImage = session?.user?.image ?? null;

  return (
    <header className="sticky top-0 z-50 bg-lumi-bg/85 backdrop-blur-lg">
      {/* Phones: logo, count and avatar on one row, the links on a second.
          From sm up: one row, links in the middle. */}
      <div className="max-w-6xl mx-auto px-6 sm:px-10 pt-4 pb-3 sm:py-5 flex items-center justify-between gap-x-4 gap-y-3 flex-wrap">
        <Link
          href="/dashboard"
          className="font-serif font-serif-soft text-[26px] font-semibold tracking-[-0.02em] text-lumi-text"
        >
          Lumi<span className="text-lumi-accent">.</span>
        </Link>

        <nav className="order-last sm:order-none w-full sm:w-auto flex items-center gap-6 text-sm font-medium">
          {links.map(({ href, label }) => {
            const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className={`transition-colors ${active ? "text-lumi-text" : "text-lumi-muted hover:text-lumi-text"}`}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          {pillLabel(pendingCount, maybeCount) && (
            <span className="rounded-full bg-lumi-text px-3 py-1.5 text-[13px] sm:px-4 sm:py-2 sm:text-sm font-semibold text-white whitespace-nowrap">
              {pillLabel(pendingCount, maybeCount)}
            </span>
          )}
          {userImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={userImage} alt="" className="w-9 h-9 rounded-full border border-lumi-border" />
          ) : (
            <span
              title={userEmail}
              className="w-9 h-9 rounded-full bg-lumi-surface border border-lumi-border flex items-center justify-center text-xs font-semibold text-lumi-muted"
            >
              {userEmail.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
      </div>
    </header>
  );
}

/** "7 to decide", "5 to decide · 2 maybe", "2 maybe", or nothing. */
export function pillLabel(pending?: number, maybe?: number): string | null {
  const parts: string[] = [];
  if (pending) parts.push(`${pending} to decide`);
  if (maybe) parts.push(`${maybe} maybe`);
  return parts.length ? parts.join(" · ") : null;
}
