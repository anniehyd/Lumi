"use client";

import { useSession, signOut } from "next-auth/react";
import { redirect } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { EventFeed } from "@/components/EventFeed";
import { MiniCalendar } from "@/components/MiniCalendar";
import type { Event } from "@prisma/client";

export default function Dashboard() {
  const { data: session, status } = useSession();

  const { data } = useQuery({
    queryKey: ["events", "ACCEPTED"],
    queryFn: async () => {
      const res = await fetch("/api/events?status=ACCEPTED&limit=100");
      return res.json();
    },
    enabled: status === "authenticated",
  });

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-lumi-muted">Loading...</div>
      </div>
    );
  }

  if (!session) {
    redirect("/");
  }

  const acceptedEvents: Event[] = data?.events ?? [];
  const eventDates = acceptedEvents.map((e) => e.date);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-50 bg-lumi-bg/80 backdrop-blur-lg border-b border-lumi-border">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-lumi-accent to-lumi-blue flex items-center justify-center text-base">
              📬
            </div>
            <h1 className="font-serif text-xl font-medium tracking-tight">Lumi</h1>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-sm text-lumi-muted hidden sm:inline">
              {session.user.email}
            </span>
            {session.user.image && (
              <img
                src={session.user.image}
                alt=""
                className="w-8 h-8 rounded-full border border-lumi-border"
              />
            )}
            <button
              onClick={() => signOut()}
              className="text-xs text-lumi-muted hover:text-lumi-text border border-lumi-border rounded-md px-3 py-1.5 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 h-[calc(100vh-100px)]">
          {/* Event feed */}
          <EventFeed />

          {/* Sidebar */}
          <aside className="hidden lg:flex flex-col gap-4">
            <MiniCalendar eventDates={eventDates} />

            {/* Quick stats */}
            <div className="rounded-xl border border-lumi-border bg-lumi-surface p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-lumi-muted mb-3">
                This Month
              </h3>
              <div className="space-y-2">
                <StatRow label="Attending" value={acceptedEvents.length} color="text-lumi-accent" />
              </div>
            </div>

            {/* Keyboard shortcuts */}
            <div className="rounded-xl border border-lumi-border bg-lumi-surface p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-lumi-muted mb-3">
                Shortcuts
              </h3>
              <div className="space-y-2 text-xs text-lumi-muted">
                <div className="flex justify-between">
                  <span>Navigate</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-lumi-bg border border-lumi-border font-mono text-[10px]">↑↓</kbd>
                </div>
                <div className="flex justify-between">
                  <span>Attend</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-lumi-bg border border-lumi-border font-mono text-[10px]">A</kbd>
                </div>
                <div className="flex justify-between">
                  <span>Maybe</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-lumi-bg border border-lumi-border font-mono text-[10px]">M</kbd>
                </div>
                <div className="flex justify-between">
                  <span>Decline</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-lumi-bg border border-lumi-border font-mono text-[10px]">D</kbd>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

function StatRow({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-sm text-lumi-muted">{label}</span>
      <span className={`text-sm font-semibold ${color}`}>{value}</span>
    </div>
  );
}
