"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { Nav } from "@/components/Nav";
import type { MockEvent } from "@/lib/mock/events";

type View = "month" | "week";

async function fetchEvents(): Promise<MockEvent[]> {
  const res = await fetch("/api/events?limit=200");
  if (!res.ok) throw new Error("failed");
  const data = await res.json();
  return data.events as MockEvent[];
}

export default function CalendarPage() {
  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState(() => new Date("2026-04-20"));
  const { data: allEvents = [] } = useQuery({
    queryKey: ["events"],
    queryFn: fetchEvents,
  });

  const visibleEvents = useMemo(
    () => allEvents.filter((e) => e.status === "ACCEPTED" || e.status === "PENDING"),
    [allEvents]
  );

  return (
    <div className="min-h-screen flex flex-col">
      <Nav />

      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-serif text-3xl text-lumi-text">Calendar</h1>
            <p className="text-sm text-lumi-muted mt-1">
              {visibleEvents.filter((e) => e.status === "ACCEPTED").length} accepted ·{" "}
              {visibleEvents.filter((e) => e.status === "PENDING").length} pending
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 rounded-lg border border-lumi-border p-0.5 bg-lumi-surface">
              {(["month", "week"] as View[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors capitalize ${
                    view === v
                      ? "bg-lumi-bg text-lumi-text"
                      : "text-lumi-muted hover:text-lumi-text"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setCursor((d) => shift(d, view, -1))}
                className="p-1.5 rounded hover:bg-lumi-surface text-lumi-muted"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setCursor(new Date("2026-04-20"))}
                className="text-xs text-lumi-muted hover:text-lumi-text px-2 py-1 rounded hover:bg-lumi-surface"
              >
                Today
              </button>
              <button
                onClick={() => setCursor((d) => shift(d, view, 1))}
                className="p-1.5 rounded hover:bg-lumi-surface text-lumi-muted"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {view === "month" ? (
          <MonthGrid cursor={cursor} events={visibleEvents} />
        ) : (
          <WeekGrid cursor={cursor} events={visibleEvents} />
        )}
      </main>
    </div>
  );
}

function MonthGrid({ cursor, events }: { cursor: Date; events: MockEvent[] }) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const label = cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const first = new Date(year, month, 1);
  const leading = first.getDay();
  const lastDay = new Date(year, month + 1, 0).getDate();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < leading; i++) cells.push(null);
  for (let d = 1; d <= lastDay; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const eventsByDay = new Map<string, MockEvent[]>();
  for (const e of events) {
    const d = new Date(e.startTime);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const arr = eventsByDay.get(key) ?? [];
    arr.push(e);
    eventsByDay.set(key, arr);
  }

  const today = new Date("2026-04-20");
  const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;

  return (
    <div className="rounded-xl border border-lumi-border bg-lumi-surface overflow-hidden">
      <div className="px-5 py-3 border-b border-lumi-border flex items-center gap-2">
        <CalendarDays className="w-4 h-4 text-lumi-accent" />
        <h2 className="font-serif text-lg">{label}</h2>
      </div>

      <div className="grid grid-cols-7 border-b border-lumi-border">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div
            key={d}
            className="px-3 py-2 text-[10px] uppercase tracking-wider text-lumi-subtle border-r border-lumi-border last:border-r-0"
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 auto-rows-[minmax(110px,auto)]">
        {cells.map((day, i) => {
          if (!day)
            return (
              <div
                key={i}
                className="border-r border-b border-lumi-border bg-lumi-bg/40 last-in-row:border-r-0"
              />
            );
          const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
          const dayEvents = eventsByDay.get(key) ?? [];
          const isToday = key === todayKey;
          return (
            <div
              key={i}
              className="relative border-r border-b border-lumi-border p-2 hover:bg-lumi-surface-hover transition-colors"
            >
              <div
                className={`text-xs font-medium mb-1 ${
                  isToday
                    ? "inline-flex w-5 h-5 rounded-full bg-lumi-accent text-lumi-bg items-center justify-center"
                    : "text-lumi-muted"
                }`}
              >
                {day.getDate()}
              </div>
              <div className="space-y-1">
                {dayEvents.slice(0, 3).map((e) => (
                  <EventChip key={e.id} event={e} />
                ))}
                {dayEvents.length > 3 && (
                  <div className="text-[10px] text-lumi-subtle px-1">
                    +{dayEvents.length - 3} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekGrid({ cursor, events }: { cursor: Date; events: MockEvent[] }) {
  const start = new Date(cursor);
  start.setDate(cursor.getDate() - cursor.getDay());
  const days: Date[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });

  const label = `${days[0].toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })} – ${days[6].toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

  const hours = Array.from({ length: 14 }, (_, i) => 8 + i); // 8 AM – 9 PM
  const HOUR_PX = 44;

  const today = new Date("2026-04-20");
  const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;

  return (
    <div className="rounded-xl border border-lumi-border bg-lumi-surface overflow-hidden">
      <div className="px-5 py-3 border-b border-lumi-border flex items-center gap-2">
        <CalendarDays className="w-4 h-4 text-lumi-accent" />
        <h2 className="font-serif text-lg">Week of {label}</h2>
      </div>

      <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-lumi-border">
        <div />
        {days.map((d) => {
          const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
          const isToday = key === todayKey;
          return (
            <div
              key={d.toISOString()}
              className="px-2 py-2 border-l border-lumi-border text-center"
            >
              <div className="text-[10px] uppercase tracking-wider text-lumi-subtle">
                {d.toLocaleDateString("en-US", { weekday: "short" })}
              </div>
              <div
                className={`text-sm mt-0.5 ${
                  isToday ? "text-lumi-accent font-semibold" : "text-lumi-text"
                }`}
              >
                {d.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-[60px_repeat(7,1fr)] relative">
        <div>
          {hours.map((h) => (
            <div
              key={h}
              className="text-[10px] text-lumi-subtle text-right pr-2"
              style={{ height: HOUR_PX }}
            >
              {formatHour(h)}
            </div>
          ))}
        </div>
        {days.map((d, di) => (
          <div key={di} className="relative border-l border-lumi-border">
            {hours.map((h) => (
              <div
                key={h}
                className="border-t border-lumi-border/50"
                style={{ height: HOUR_PX }}
              />
            ))}
            {events
              .filter((e) => sameDay(new Date(e.startTime), d))
              .map((e) => {
                const s = new Date(e.startTime);
                const en = e.endTime
                  ? new Date(e.endTime)
                  : new Date(s.getTime() + 60 * 60 * 1000);
                const startH = s.getHours() + s.getMinutes() / 60;
                const endH = en.getHours() + en.getMinutes() / 60;
                const top = (startH - 8) * HOUR_PX;
                const height = Math.max(24, (endH - startH) * HOUR_PX);
                if (startH < 8 || startH > 22) return null;
                return (
                  <Link
                    key={e.id}
                    href={`/events/${e.id}`}
                    className={`absolute left-1 right-1 rounded-md px-2 py-1 text-[11px] overflow-hidden hover:z-10 hover:shadow-lg transition-shadow ${
                      e.status === "ACCEPTED"
                        ? "bg-lumi-green/20 border border-lumi-green/40 text-lumi-text"
                        : "bg-lumi-accent/15 border border-lumi-accent/40 text-lumi-text"
                    }`}
                    style={{ top, height }}
                  >
                    <div className="font-medium truncate">{e.title}</div>
                    <div className="text-[10px] text-lumi-muted truncate">
                      {s.toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </div>
                  </Link>
                );
              })}
          </div>
        ))}
      </div>
    </div>
  );
}

function EventChip({ event }: { event: MockEvent }) {
  const isAccepted = event.status === "ACCEPTED";
  return (
    <Link
      href={`/events/${event.id}`}
      className={`block text-[11px] px-1.5 py-0.5 rounded truncate transition-colors ${
        isAccepted
          ? "bg-lumi-green/20 text-lumi-text hover:bg-lumi-green/30"
          : "bg-lumi-accent/15 text-lumi-text hover:bg-lumi-accent/25"
      }`}
    >
      <span className="text-lumi-subtle mr-1">
        {new Date(event.startTime).toLocaleTimeString("en-US", {
          hour: "numeric",
        })}
      </span>
      {event.title}
    </Link>
  );
}

function shift(d: Date, view: View, dir: 1 | -1): Date {
  const next = new Date(d);
  if (view === "month") next.setMonth(next.getMonth() + dir);
  else next.setDate(next.getDate() + 7 * dir);
  return next;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatHour(h: number): string {
  const period = h >= 12 ? "PM" : "AM";
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour} ${period}`;
}
