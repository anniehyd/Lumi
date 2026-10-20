"use client";

import { useQuery } from "@tanstack/react-query";
import { EventFeed, pendingOf } from "@/components/EventFeed";
import { Nav } from "@/components/Nav";
import { MissReport } from "@/components/MissReport";
import { StarCursor } from "@/components/StarCursor";
import type { MockEvent } from "@/lib/mock/events";
import type { SyncStatus } from "@/lib/dataSource";

async function fetchEvents(): Promise<MockEvent[]> {
  const res = await fetch("/api/events?limit=200");
  if (!res.ok) throw new Error("failed");
  const data = await res.json();
  return data.events as MockEvent[];
}


async function fetchSyncStatus(): Promise<SyncStatus> {
  const res = await fetch("/api/sync/status");
  if (!res.ok) throw new Error("failed");
  return (await res.json()) as SyncStatus;
}

/**
 * The one page that matters: a sentence about the week, then the list of
 * things to decide. No sidebar, no system panel; the numbers that used to
 * live there are one quiet line at the bottom.
 */
export default function Dashboard() {
  const { data: events = [] } = useQuery({
    queryKey: ["events"],
    queryFn: fetchEvents,
    refetchInterval: 60_000,
  });
  const { data: syncStatus } = useQuery({
    queryKey: ["sync-status"],
    queryFn: fetchSyncStatus,
    refetchInterval: 60_000,
  });

  const pending = pendingOf(events);
  const now = Date.now();
  const onCalendar = events.filter(
    (e) => e.status === "ACCEPTED" && new Date(e.startTime).getTime() > now
  ).length;

  return (
    <div className="lumi-custom-cursor min-h-screen flex flex-col bg-lumi-bg">
      <StarCursor />
      <Nav pendingCount={pending.length} />

      <main className="flex-1 w-full max-w-[1040px] mx-auto px-6 sm:px-10 pt-10 sm:pt-16 pb-24 flex flex-col gap-16">
        <EventFeed
          lastScan={syncStatus?.lastIngest}
          emailsThisWeek={syncStatus?.emailsThisWeek}
          cardsThisWeek={syncStatus?.cardsThisWeek}
        />

        <footer className="flex flex-wrap items-end justify-between gap-8">
          <div className="max-w-[26ch] font-serif font-serif-soft text-[26px] sm:text-[30px] leading-[1.2] tracking-[-0.02em] text-lumi-text">
            Nothing lands on your calendar until you say so.{" "}
            <span className="italic">
              <MissReport />
            </span>
          </div>
          <dl className="flex gap-9 text-sm text-lumi-muted">
            <div className="group/stat transition-transform hover:-translate-y-0.5">
              <dt className="sr-only">On your calendar</dt>
              <dd className="font-serif text-[40px] font-light leading-none text-lumi-text">{onCalendar}</dd>
              <dd>on your calendar</dd>
            </div>
            <div className="group/stat transition-transform hover:-translate-y-0.5">
              <dt className="sr-only">Source</dt>
              <dd className="font-serif text-[40px] font-light leading-none text-lumi-accent">
                {syncStatus?.source === "db" ? "live" : "demo"}
              </dd>
              <dd>{syncStatus?.source === "db" ? "your inbox" : "sample data"}</dd>
            </div>
          </dl>
        </footer>

        <p className="text-xs text-lumi-subtle">
          Keyboard: <Kbd>J</Kbd> <Kbd>K</Kbd> move · <Kbd>A</Kbd> attend · <Kbd>M</Kbd> maybe ·{" "}
          <Kbd>D</Kbd> skip
        </p>
      </main>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-lumi-border bg-white px-1.5 py-0.5 font-sans text-[11px] text-lumi-text">
      {children}
    </kbd>
  );
}
