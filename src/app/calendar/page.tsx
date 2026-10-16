"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Nav } from "@/components/Nav";
import { StarCursor } from "@/components/StarCursor";
import type { MockEvent } from "@/lib/mock/events";

type View = "month" | "week";

async function fetchEvents(): Promise<MockEvent[]> {
  const res = await fetch("/api/events?limit=200");
  if (!res.ok) throw new Error("failed");
  const data = await res.json();
  return data.events as MockEvent[];
}

/**
 * The calendar: what is on it (accepted) and what is still waiting (pending
 * and maybe), on the same grid. Accepted events are solid ink, undecided ones
 * are outlined, so the eye reads commitment before it reads titles.
 */
export default function CalendarPage() {
  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState(() => new Date());
  const { data: allEvents = [] } = useQuery({ queryKey: ["events"], queryFn: fetchEvents });

  const visible = useMemo(
    () => allEvents.filter((e) => e.status === "ACCEPTED" || e.status === "PENDING" || e.status === "MAYBE"),
    [allEvents]
  );
  const accepted = visible.filter((e) => e.status === "ACCEPTED").length;
  const undecided = visible.length - accepted;

  const title =
    view === "month"
      ? cursor.toLocaleDateString("en-US", { month: "long" })
      : `Week of ${weekStart(cursor).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  const year = cursor.getFullYear();

  return (
    <div className="lumi-custom-cursor min-h-screen flex flex-col bg-lumi-bg">
      <StarCursor />
      <Nav />

      <main className="flex-1 w-full max-w-6xl mx-auto px-6 sm:px-10 pt-10 sm:pt-14 pb-24 flex flex-col gap-10">
        <section className="flex flex-wrap items-end justify-between gap-6">
          <div className="flex flex-col gap-3">
            <p className="animate-rise [animation-delay:80ms] inline-flex items-center gap-2.5 text-sm text-lumi-muted">
              <span className="w-2 h-2 rounded-full bg-lumi-accent" />
              {accepted} on your calendar · {undecided} still to decide
            </p>
            <h1 className="animate-rise [animation-delay:200ms] font-serif text-[52px] sm:text-[72px] font-normal leading-[0.98] tracking-[-0.03em] text-lumi-text">
              {title}
              <span className="font-serif-soft font-light text-lumi-subtle"> {year}</span>
            </h1>
          </div>

          <div className="animate-rise [animation-delay:320ms] flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-full bg-lumi-surface p-1">
              {(["month", "week"] as View[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`min-h-[40px] rounded-full px-4 text-sm font-semibold capitalize transition-colors ${
                    view === v ? "bg-lumi-text text-white" : "text-lumi-muted hover:text-lumi-text"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
            <div className="inline-flex items-center gap-1.5">
              <button
                onClick={() => setCursor((d) => shift(d, view, -1))}
                aria-label={`Previous ${view}`}
                data-cursor={`previous ${view}`}
                data-cursor-tone="ink"
                className="w-11 h-11 rounded-full border-[1.5px] border-lumi-border bg-white text-lumi-text hover:border-lumi-text transition-colors inline-flex items-center justify-center"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setCursor(new Date())}
                className="min-h-[44px] rounded-full border-[1.5px] border-lumi-border bg-white px-4 text-sm font-semibold text-lumi-text hover:border-lumi-text transition-colors"
              >
                Today
              </button>
              <button
                onClick={() => setCursor((d) => shift(d, view, 1))}
                aria-label={`Next ${view}`}
                data-cursor={`next ${view}`}
                data-cursor-tone="ink"
                className="w-11 h-11 rounded-full border-[1.5px] border-lumi-border bg-white text-lumi-text hover:border-lumi-text transition-colors inline-flex items-center justify-center"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </section>

        <div className="animate-rise [animation-delay:420ms]">
          {view === "month" ? (
            <MonthGrid cursor={cursor} events={visible} />
          ) : (
            <WeekGrid cursor={cursor} events={visible} />
          )}
        </div>

        <p className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-lumi-muted">
          <span className="inline-flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded-full bg-lumi-text" /> on Google Calendar
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded-full border-[1.5px] border-lumi-text bg-white" /> waiting for your decision
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded-full bg-[#DCE3FF]" /> maybe
          </span>
        </p>
      </main>
    </div>
  );
}

function chipTone(e: MockEvent): string {
  if (e.status === "ACCEPTED") return "bg-lumi-text text-white hover:bg-lumi-accent";
  if (e.status === "MAYBE") return "bg-[#DCE3FF] text-lumi-accent hover:bg-lumi-accent hover:text-white";
  return "bg-white text-lumi-text border-[1.5px] border-lumi-text hover:bg-lumi-text hover:text-white";
}

function EventChip({ event, showTime = true }: { event: MockEvent; showTime?: boolean }) {
  const time = new Date(event.startTime).toLocaleTimeString("en-US", { hour: "numeric" }).replace(" ", "");
  return (
    <Link
      href={`/events/${event.id}`}
      data-cursor="open"
      data-cursor-tone="ink"
      className={`block truncate rounded-full px-2.5 py-1 text-[12px] font-semibold leading-tight transition-colors ${chipTone(event)}`}
    >
      {showTime && <span className="opacity-60 mr-1.5">{time}</span>}
      {event.title}
    </Link>
  );
}

function MonthGrid({ cursor, events }: { cursor: Date; events: MockEvent[] }) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const leading = first.getDay();
  const lastDay = new Date(year, month + 1, 0).getDate();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < leading; i++) cells.push(null);
  for (let d = 1; d <= lastDay; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const byDay = new Map<string, MockEvent[]>();
  for (const e of events) {
    const k = dayKey(new Date(e.startTime));
    byDay.set(k, [...(byDay.get(k) ?? []), e]);
  }
  const todayKey = dayKey(new Date());

  return (
    <div className="overflow-x-auto -mx-6 sm:mx-0 px-6 sm:px-0">
      <div className="min-w-[640px]">
        <div className="grid grid-cols-7 border-b border-lumi-border">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="pb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-lumi-subtle">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            if (!day) return <div key={i} className="min-h-[104px] border-b border-lumi-border" />;
            const key = dayKey(day);
            const dayEvents = (byDay.get(key) ?? []).sort((a, b) => a.startTime.localeCompare(b.startTime));
            const isToday = key === todayKey;
            return (
              <div
                key={i}
                className="min-h-[104px] border-b border-lumi-border py-2.5 pr-2 flex flex-col gap-1.5 transition-colors hover:bg-[#FAFAF7] rounded-lg"
              >
                <div
                  className={`font-serif font-serif-soft text-[20px] leading-none w-8 h-8 inline-flex items-center justify-center rounded-full ${
                    isToday ? "bg-lumi-accent text-white" : "text-lumi-text"
                  }`}
                >
                  {day.getDate()}
                </div>
                <div className="flex flex-col gap-1">
                  {dayEvents.slice(0, 3).map((e) => (
                    <EventChip key={e.id} event={e} />
                  ))}
                  {dayEvents.length > 3 && (
                    <span className="px-2 text-[11px] text-lumi-subtle">+{dayEvents.length - 3} more</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function WeekGrid({ cursor, events }: { cursor: Date; events: MockEvent[] }) {
  const start = weekStart(cursor);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
  const hours = Array.from({ length: 14 }, (_, i) => 8 + i); // 8 AM – 9 PM
  const HOUR_PX = 48;
  const todayKey = dayKey(new Date());

  return (
    <div className="overflow-x-auto -mx-6 sm:mx-0 px-6 sm:px-0">
      <div className="min-w-[760px]">
        <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-lumi-border">
          <div />
          {days.map((d) => {
            const isToday = dayKey(d) === todayKey;
            return (
              <div key={d.toISOString()} className="pb-3 flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-lumi-subtle">
                  {d.toLocaleDateString("en-US", { weekday: "short" })}
                </span>
                <span
                  className={`font-serif font-serif-soft text-[20px] leading-none w-8 h-8 inline-flex items-center justify-center rounded-full ${
                    isToday ? "bg-lumi-accent text-white" : "text-lumi-text"
                  }`}
                >
                  {d.getDate()}
                </span>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-[56px_repeat(7,1fr)]">
          <div>
            {hours.map((h) => (
              <div key={h} className="text-[11px] text-lumi-subtle pr-3 text-right -translate-y-2" style={{ height: HOUR_PX }}>
                {formatHour(h)}
              </div>
            ))}
          </div>
          {days.map((d, di) => (
            <div key={di} className="relative border-l border-lumi-border">
              {hours.map((h) => (
                <div key={h} className="border-t border-lumi-border/70" style={{ height: HOUR_PX }} />
              ))}
              {events
                .filter((e) => sameDay(new Date(e.startTime), d))
                .map((e) => {
                  const s = new Date(e.startTime);
                  const en = e.endTime ? new Date(e.endTime) : new Date(s.getTime() + 3600_000);
                  const startH = s.getHours() + s.getMinutes() / 60;
                  const endH = en.getHours() + en.getMinutes() / 60;
                  if (startH < 8 || startH > 22) return null;
                  const top = (startH - 8) * HOUR_PX + 2;
                  const height = Math.max(30, (endH - startH) * HOUR_PX - 4);
                  return (
                    <Link
                      key={e.id}
                      href={`/events/${e.id}`}
                      data-cursor="open"
                      data-cursor-tone="ink"
                      className={`absolute left-1 right-1 overflow-hidden rounded-xl px-2.5 py-1.5 text-[12px] leading-tight transition-colors ${chipTone(e)}`}
                      style={{ top, height }}
                    >
                      <div className="font-semibold truncate">{e.title}</div>
                      <div className="opacity-60 truncate">
                        {s.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                      </div>
                    </Link>
                  );
                })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function weekStart(d: Date): Date {
  const s = new Date(d);
  s.setDate(d.getDate() - d.getDay());
  s.setHours(0, 0, 0, 0);
  return s;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function shift(d: Date, view: View, dir: 1 | -1): Date {
  const next = new Date(d);
  if (view === "month") next.setMonth(next.getMonth() + dir);
  else next.setDate(next.getDate() + 7 * dir);
  return next;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatHour(h: number): string {
  const period = h >= 12 ? "PM" : "AM";
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour} ${period}`;
}
