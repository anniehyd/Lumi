"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Inbox, Calendar, Settings } from "lucide-react";

const links = [
  { href: "/dashboard", label: "Inbox", icon: Inbox },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Nav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const userEmail = session?.user?.email ?? "annie@livingbrands.ai";
  const userImage = session?.user?.image ?? null;

  return (
    <header className="sticky top-0 z-50 bg-lumi-bg/80 backdrop-blur-lg border-b border-lumi-border">
      <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-lumi-accent to-lumi-blue flex items-center justify-center text-sm">
              ✦
            </div>
            <h1 className="font-serif text-lg tracking-tight">Lumi</h1>
          </Link>

          <nav className="flex items-center gap-1">
            {links.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
                    active
                      ? "bg-lumi-surface text-lumi-text"
                      : "text-lumi-muted hover:text-lumi-text hover:bg-lumi-surface/50"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-lumi-muted hidden md:inline">{userEmail}</span>
          {userImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={userImage}
              alt=""
              className="w-8 h-8 rounded-full border border-lumi-border"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-lumi-surface border border-lumi-border flex items-center justify-center text-xs font-medium text-lumi-muted">
              {userEmail.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
