"use client";

import { useQuery } from "@tanstack/react-query";
import { EventFeed } from "@/components/EventFeed";
import { MiniCalendar } from "@/components/MiniCalendar";
import { Nav } from "@/components/Nav";
import type { MockEvent } from "@/lib/mock/events";

async function fetchEvents(): Promise<MockEvent[]> {
  const res = await fetch("/api/events?limit=200");
  if (!res.ok) throw new Error("failed");
  const data = await res.json();
  return data.events as MockEvent[];
}

export default function Dashboard() {
  const { data: events = [] } = useQuery({
    queryKey: ["events"],
    queryFn: fetchEvents,
  });

  const acceptedCount = events.filter((e) => e.status === "ACCEPTED").length;
  const pendingCount = events.filter((e) => e.status === "PENDING").length;
  const eventDates = events.map((e) => e.startTime);

  return (
    <div className="min-h-screen flex flex-col">
      <Nav />

      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 h-[calc(100vh-100px)]">
          <EventFeed />

          <aside className="hidden lg:flex flex-col gap-4">
            <MiniCalendar eventDates={eventDates} />

            <div className="rounded-xl border border-lumi-border bg-lumi-surface p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-lumi-muted mb-3">
                This Month
              </h3>
              <div className="space-y-2">
                <StatRow label="Attending" value={acceptedCount} color="text-lumi-green" />
                <StatRow label="Pending" value={pendingCount} color="text-lumi-accent" />
              </div>
            </div>

            <div className="rounded-xl border border-lumi-border bg-lumi-surface p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-lumi-muted mb-3">
                Shortcuts
              </h3>
              <div className="space-y-2 text-xs text-lumi-muted">
                <Shortcut label="Navigate" keys={["J", "K"]} />
                <Shortcut label="Attend" keys={["A"]} />
                <Shortcut label="Maybe" keys={["M"]} />
                <Shortcut label="Decline" keys={["D"]} />
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

function StatRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-sm text-lumi-muted">{label}</span>
      <span className={`text-sm font-semibold ${color}`}>{value}</span>
    </div>
  );
}

function Shortcut({ label, keys }: { label: string; keys: string[] }) {
  return (
    <div className="flex justify-between items-center">
      <span>{label}</span>
      <span className="flex gap-1">
        {keys.map((k) => (
          <kbd
            key={k}
            className="px-1.5 py-0.5 rounded bg-lumi-bg border border-lumi-border font-mono text-[10px] text-lumi-text"
          >
            {k}
          </kbd>
        ))}
      </span>
    </div>
  );
}
