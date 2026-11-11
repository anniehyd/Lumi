"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

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
          <AccountMenu
            email={session?.user?.email ?? null}
            name={session?.user?.name ?? null}
            image={userImage}
            isAdmin={Boolean(session?.user?.isAdmin)}
            fallback={userEmail}
          />
        </div>
      </div>
    </header>
  );
}

/**
 * The avatar, and for a signed-in user the menu behind it: who they are
 * signed in as, the operator view when it is theirs to see, and the way out.
 * In demo mode there is no account, so the avatar is only a label.
 */
function AccountMenu({
  email,
  name,
  image,
  isAdmin,
  fallback,
}: {
  email: string | null;
  name: string | null;
  image: string | null;
  isAdmin: boolean;
  fallback: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const face = image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={image} alt="" className="w-9 h-9 rounded-full border border-lumi-border" />
  ) : (
    <span className="w-9 h-9 rounded-full bg-lumi-surface border border-lumi-border flex items-center justify-center text-xs font-semibold text-lumi-muted">
      {fallback.charAt(0).toUpperCase()}
    </span>
  );

  if (!email) return <span title={fallback}>{face}</span>;

  const item = "block w-full text-left px-4 py-2.5 text-sm font-medium text-lumi-text hover:bg-lumi-surface transition-colors";
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account: ${email}`}
        className="block rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-lumi-accent focus-visible:ring-offset-2"
      >
        {face}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-64 overflow-hidden rounded-2xl border border-lumi-border bg-lumi-bg shadow-[0_18px_40px_-20px_rgba(17,17,17,0.35)]"
        >
          <div className="px-4 py-3 border-b border-lumi-border">
            {name && <div className="text-sm font-semibold text-lumi-text truncate">{name}</div>}
            <div className="text-xs text-lumi-muted truncate">{email}</div>
          </div>
          <Link href="/settings" role="menuitem" className={item} onClick={() => setOpen(false)}>
            Settings
          </Link>
          {isAdmin && (
            <Link href="/admin" role="menuitem" className={item} onClick={() => setOpen(false)}>
              Operator view
            </Link>
          )}
          <button
            role="menuitem"
            onClick={() => signOut({ callbackUrl: "/" })}
            className={`${item} border-t border-lumi-border text-lumi-muted hover:text-lumi-rose`}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

/** "7 to decide", "5 to decide · 2 maybe", "2 maybe", or nothing. */
export function pillLabel(pending?: number, maybe?: number): string | null {
  const parts: string[] = [];
  if (pending) parts.push(`${pending} to decide`);
  if (maybe) parts.push(`${maybe} maybe`);
  return parts.length ? parts.join(" · ") : null;
}
