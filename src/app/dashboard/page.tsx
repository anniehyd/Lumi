"use client";

import { useQuery } from "@tanstack/react-query";
import { EventFeed } from "@/components/EventFeed";
import { MiniCalendar } from "@/components/MiniCalendar";
import { Nav } from "@/components/Nav";
import type { MockEvent } from "@/lib/mock/events";
import { Activity, Database, MailCheck } from "lucide-react";

async function fetchEvents(): Promise<MockEvent[]> {
  const res = await fetch("/api/events?limit=200");
  if (!res.ok) throw new Error("failed");
  const data = await res.json();
  return data.events as MockEvent[];
}

type SyncStatus = {
  dbConnected: boolean;
  eventCount: number;
  pendingCount: number;
  lastIngest: string | null;
  source: "db" | "mock";
};

async function fetchSyncStatus(): Promise<SyncStatus> {
  const res = await fetch("/api/sync/status");
  if (!res.ok) throw new Error("failed");
  return (await res.json()) as SyncStatus;
}

export default function Dashboard() {
  const { data: events = [] } = useQuery({
    queryKey: ["events"],
    queryFn: fetchEvents,
  });
  const { data: syncStatus } = useQuery({
    queryKey: ["sync-status"],
    queryFn: fetchSyncStatus,
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
                System
              </h3>
              <div className="space-y-2">
                <StatusRow
                  icon={<Database className="w-3.5 h-3.5" />}
                  label="Source"
                  value={syncStatus?.source === "db" ? "Database" : "Demo data"}
                  tone={syncStatus?.dbConnected ? "text-lumi-green" : "text-lumi-accent"}
                />
                <StatusRow
                  icon={<MailCheck className="w-3.5 h-3.5" />}
                  label="Events"
                  value={String(syncStatus?.eventCount ?? events.length)}
                />
                <StatusRow
                  icon={<Activity className="w-3.5 h-3.5" />}
                  label="Last scan"
                  value={formatLastIngest(syncStatus?.lastIngest)}
                />
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

function StatusRow({
  icon,
  label,
  value,
  tone = "text-lumi-text",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="flex items-center gap-1.5 text-lumi-muted">
        <span className="text-lumi-subtle">{icon}</span>
        {label}
      </span>
      <span className={`truncate ${tone}`}>{value}</span>
    </div>
  );
}

function formatLastIngest(iso?: string | null): string {
  if (!iso) return "None yet";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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
