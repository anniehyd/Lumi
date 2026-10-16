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
 * Top bar. `pendingCount` lets the dashboard show how many decisions are
 * waiting as the primary pill; other pages leave it off.
 */
export function Nav({ pendingCount }: { pendingCount?: number } = {}) {
  const pathname = usePathname();
  const { data: session } = useSession();
  // No signed-in user means demo mode; never show a real address as a stand-in.
  const userEmail = session?.user?.email ?? "Demo";
  const userImage = session?.user?.image ?? null;

  return (
    <header className="sticky top-0 z-50 bg-lumi-bg/85 backdrop-blur-lg">
      <div className="max-w-6xl mx-auto px-6 sm:px-10 py-5 flex items-center justify-between gap-4 flex-wrap">
        <Link
          href="/dashboard"
          className="font-serif font-serif-soft text-[26px] font-semibold tracking-[-0.02em] text-lumi-text"
        >
          Lumi<span className="text-lumi-accent">.</span>
        </Link>

        <nav className="flex items-center gap-6 text-sm font-medium">
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
          {typeof pendingCount === "number" && pendingCount > 0 && (
            <span className="rounded-full bg-lumi-text px-4 py-2 text-sm font-semibold text-white">
              {pendingCount} to decide
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
