"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Nav } from "@/components/Nav";
import { StarCursor } from "@/components/StarCursor";
import type { MockEvent } from "@/lib/mock/events";
import { formatRange, parseKey, type Poll } from "@/lib/meet";

type View = "schedule" | "month" | "week";

async function fetchEvents(): Promise<MockEvent[]> {
  const res = await fetch("/api/events?limit=200");
  if (!res.ok) throw new Error("failed");
  const data = await res.json();
  return data.events as MockEvent[];
}

type PollRow = Poll & { responseCount: number };
async function fetchPolls(): Promise<PollRow[]> {
  const res = await fetch("/api/meet");
  if (!res.ok) return [];
  return ((await res.json()).polls as PollRow[]) ?? [];
}

/**
 * The calendar.
 *
 * A student has a handful of events a week, not forty, so the default view
 * is a schedule: every day that has something, with the full title, time and
 * place readable at a glance. The month grid stays for orientation (titles
 * wrap instead of being cut), and the week grid for seeing clashes.
 *
 * Status is carried by shape: a solid ink dot or block is on Google
 * Calendar, an outline is still waiting for a decision, light blue is maybe.
 */
export default function CalendarPage() {
  const [view, setView] = useState<View>("schedule");
  const [cursor, setCursor] = useState(() => new Date());
  const { data: allEvents = [] } = useQuery({ queryKey: ["events"], queryFn: fetchEvents });
  const { data: polls = [] } = useQuery({ queryKey: ["meet-list"], queryFn: fetchPolls });

  const visible = useMemo(
    () =>
      allEvents
        .filter((e) => e.status === "ACCEPTED" || e.status === "PENDING" || e.status === "MAYBE")
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [allEvents]
  );
  const accepted = visible.filter((e) => e.status === "ACCEPTED").length;
  const undecided = visible.length - accepted;

  const title =
    view === "month"
      ? cursor.toLocaleDateString("en-US", { month: "long" })
      : view === "week"
        ? `Week of ${weekStart(cursor).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
        : "Coming up";
  const year = view === "schedule" ? "" : ` ${cursor.getFullYear()}`;

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
            <h1 className="animate-rise [animation-delay:200ms] font-serif text-[40px] sm:text-[56px] font-normal leading-[0.98] tracking-[-0.03em] text-lumi-text">
              {title}
              {year && <span className="font-serif-soft font-light text-lumi-subtle">{year}</span>}
            </h1>
          </div>

          <div className="animate-rise [animation-delay:320ms] flex flex-wrap items-center gap-3">
            <Link
              href="/meet/new"
              data-cursor="find a time"
              data-cursor-tone="mark"
              className="inline-flex items-center min-h-[44px] rounded-full bg-lumi-text px-5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5"
            >
              Find a time with others →
            </Link>
            <div className="inline-flex rounded-full bg-lumi-surface p-1">
              {(["schedule", "month", "week"] as View[]).map((v) => (
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
            {view !== "schedule" && (
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
            )}
          </div>
        </section>

        <div className="animate-rise [animation-delay:420ms]">
          {view === "schedule" && <Schedule events={visible} />}
          {view === "month" && <MonthGrid cursor={cursor} events={visible} />}
          {view === "week" && <WeekGrid cursor={cursor} events={visible} />}
        </div>

        {polls.length > 0 && (
          <section className="flex flex-col gap-4 border-t border-lumi-border pt-8">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="font-serif text-[28px] font-medium leading-[1.1] tracking-[-0.02em]">Group polls</h2>
              <Link href="/meet/new" className="text-sm font-semibold text-lumi-accent underline underline-offset-[3px] hover:text-lumi-text">
                New poll
              </Link>
            </div>
            <ul className="divide-y divide-lumi-border border-t border-b border-lumi-border">
              {polls.map((p) => (
                <li key={p.slug}>
                  <Link
                    href={`/meet/${p.slug}`}
                    data-cursor="open poll"
                    data-cursor-tone="ink"
                    className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 py-4 text-lumi-text hover:text-lumi-accent transition-colors"
                  >
                    <span className="font-semibold text-[15px]">{p.title}</span>
                    <span className="text-sm text-lumi-muted">
                      {p.finalStart && p.finalEnd
                        ? `Picked · ${formatRange({ day: parseKey(p.finalStart)!.day, start: p.finalStart, end: p.finalEnd })}`
                        : `${p.responseCount} answer${p.responseCount === 1 ? "" : "s"} · ${p.days.length} day${p.days.length === 1 ? "" : "s"}`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

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

/* ─── Status marks ─── */

function Dot({ status, className = "" }: { status: MockEvent["status"]; className?: string }) {
  const tone =
    status === "ACCEPTED"
      ? "bg-lumi-text"
      : status === "MAYBE"
        ? "bg-[#DCE3FF]"
        : "bg-white border-[1.5px] border-lumi-text";
  return <span aria-hidden="true" className={`inline-block w-3 h-3 rounded-full shrink-0 ${tone} ${className}`} />;
}

function statusWord(status: MockEvent["status"]): string {
  return status === "ACCEPTED" ? "On your calendar" : status === "MAYBE" ? "Maybe" : "To decide";
}

function timeOf(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: d.getMinutes() ? "2-digit" : undefined });
}

function timeSpan(e: MockEvent): string {
  return e.endTime ? `${timeOf(e.startTime)}–${timeOf(e.endTime)}` : timeOf(e.startTime);
}

/* ─── Schedule: the default ─── */

function Schedule({ events }: { events: MockEvent[] }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const horizon = new Date(today);
  horizon.setDate(today.getDate() + 42);
  const todayKey = dayKey(today);
  const thisWeek = weekStart(today).getTime();

  // Every day in the next six weeks that has something, plus today itself.
  const byDay = new Map<string, MockEvent[]>();
  for (const e of events) {
    const d = new Date(e.startTime);
    if (d < today || d > horizon) continue;
    const k = dayKey(d);
    byDay.set(k, [...(byDay.get(k) ?? []), e]);
  }
  if (!byDay.has(todayKey)) byDay.set(todayKey, []);
  const days = [...byDay.keys()].sort();

  // A header per week, in words rather than dates where that reads better.
  const weekLabel = (day: Date) => {
    const ws = weekStart(day).getTime();
    const diff = Math.round((ws - thisWeek) / (7 * 86_400_000));
    if (diff === 0) return "This week";
    if (diff === 1) return "Next week";
    const start = new Date(ws);
    const end = new Date(ws + 6 * 86_400_000);
    return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    })}`;
  };

  const later = events.filter((e) => new Date(e.startTime) > horizon).length;
  let lastWeek = "";

  return (
    <div className="flex flex-col">
      {days.map((k) => {
        const [y, m, d] = k.split("-").map(Number);
        const date = new Date(y, m, d);
        const dayEvents = byDay.get(k) ?? [];
        const isToday = k === todayKey;
        const label = weekLabel(date);
        const showWeek = label !== lastWeek;
        lastWeek = label;
        return (
          <div key={k}>
            {showWeek && (
              <h2 className="pt-8 pb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-lumi-subtle first:pt-0">{label}</h2>
            )}
            <section className="grid grid-cols-[72px_1fr] sm:grid-cols-[120px_1fr] gap-x-6 border-t border-lumi-border py-5">
              <div className="flex sm:flex-col items-baseline sm:items-start gap-2 sm:gap-0">
                <div
                  className={`font-serif font-serif-soft text-[40px] sm:text-[48px] leading-none tracking-[-0.03em] ${
                    isToday ? "text-lumi-accent" : "text-lumi-text"
                  }`}
                >
                  {date.getDate()}
                </div>
                <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-lumi-subtle sm:mt-2">
                  {isToday ? "Today" : date.toLocaleDateString("en-US", { weekday: "long" })}
                </div>
              </div>

              <ul className="flex flex-col divide-y divide-lumi-border -my-2">
                {dayEvents.length === 0 && (
                  <li className="py-2 text-[15px] text-lumi-muted">Nothing on the calendar.</li>
                )}
                {dayEvents.map((e) => (
                  <li key={e.id}>
                    <Link
                      href={`/events/${e.id}`}
                      data-cursor="open"
                      data-cursor-tone="ink"
                      className="group grid grid-cols-[auto_1fr] sm:grid-cols-[auto_150px_1fr] gap-x-4 gap-y-1 items-start py-3 text-lumi-text"
                    >
                      <Dot status={e.status} className="mt-[7px]" />
                      <span className="text-[15px] font-semibold tabular-nums sm:text-lumi-muted sm:font-medium">
                        {timeSpan(e)}
                      </span>
                      <span className="col-start-2 sm:col-start-3 min-w-0 flex flex-col gap-0.5">
                        <span className="font-serif text-[22px] sm:text-[24px] font-medium leading-[1.15] tracking-[-0.015em] group-hover:text-lumi-accent transition-colors">
                          {e.title}
                        </span>
                        <span className="text-sm text-lumi-muted">
                          {[e.locationName, e.organizerCompany ?? e.organizerName].filter(Boolean).join(" · ")}
                          {(e.locationName || e.organizerCompany || e.organizerName) && " · "}
                          <span className={e.status === "PENDING" ? "text-lumi-text font-semibold" : ""}>{statusWord(e.status)}</span>
                          {e.conflictTitle && <span className="text-lumi-rose"> · overlaps {e.conflictTitle}</span>}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        );
      })}
      <div className="border-t border-lumi-border pt-5 text-sm text-lumi-muted">
        {later > 0
          ? `${later} more after that. Switch to Month to see further out.`
          : "That is everything for the next six weeks."}
      </div>
    </div>
  );
}

/* ─── Month ─── */

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
      <div className="min-w-[920px]">
        <div className="grid grid-cols-7 border-b border-lumi-border">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="pb-3 pr-3 text-[11px] font-bold uppercase tracking-[0.1em] text-lumi-subtle">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            if (!day) return <div key={i} className="min-h-[120px] border-b border-lumi-border" />;
            const key = dayKey(day);
            const dayEvents = byDay.get(key) ?? [];
            const isToday = key === todayKey;
            return (
              <div key={i} className="min-h-[120px] border-b border-lumi-border py-2.5 pr-3 flex flex-col gap-2">
                <div
                  className={`font-serif font-serif-soft text-[20px] leading-none w-8 h-8 inline-flex items-center justify-center rounded-full ${
                    isToday ? "bg-lumi-accent text-white" : "text-lumi-text"
                  }`}
                >
                  {day.getDate()}
                </div>
                <ul className="flex flex-col gap-1.5">
                  {dayEvents.map((e) => (
                    <li key={e.id}>
                      <Link
                        href={`/events/${e.id}`}
                        data-cursor="open"
                        data-cursor-tone="ink"
                        className="flex items-start gap-1.5 text-[12.5px] leading-[1.3] text-lumi-text hover:text-lumi-accent transition-colors"
                      >
                        <Dot status={e.status} className="mt-[3px] !w-2.5 !h-2.5" />
                        <span className="min-w-0">
                          <span className="text-lumi-muted tabular-nums">{timeOf(e.startTime)}</span>{" "}
                          <span className="font-semibold line-clamp-2">{e.title}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─── Week ─── */

function WeekGrid({ cursor, events }: { cursor: Date; events: MockEvent[] }) {
  const start = weekStart(cursor);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
  const hours = Array.from({ length: 14 }, (_, i) => 8 + i); // 8 AM – 9 PM
  const HOUR_PX = 56;
  const todayKey = dayKey(new Date());
  const scroller = useRef<HTMLDivElement>(null);

  // Open on today's column when the week is this one.
  useEffect(() => {
    const idx = days.findIndex((d) => dayKey(d) === todayKey);
    if (idx > 1 && scroller.current) scroller.current.scrollLeft = Math.max(0, idx - 1) * 150;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor]);

  const blockTone = (s: MockEvent["status"]) =>
    s === "ACCEPTED"
      ? "bg-lumi-text text-white"
      : s === "MAYBE"
        ? "bg-[#DCE3FF] text-lumi-text"
        : "bg-white text-lumi-text border-[1.5px] border-lumi-text";

  return (
    <div ref={scroller} className="overflow-x-auto -mx-6 sm:mx-0 px-6 sm:px-0">
      <div className="min-w-[1100px]">
        <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-lumi-border">
          <div />
          {days.map((d) => {
            const isToday = dayKey(d) === todayKey;
            return (
              <div key={d.toISOString()} className="pb-3 pl-2 flex items-center gap-2">
                <span
                  className={`font-serif font-serif-soft text-[20px] leading-none w-8 h-8 inline-flex items-center justify-center rounded-full ${
                    isToday ? "bg-lumi-accent text-white" : "text-lumi-text"
                  }`}
                >
                  {d.getDate()}
                </span>
                <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-lumi-subtle">
                  {d.toLocaleDateString("en-US", { weekday: "short" })}
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
                  const height = Math.max(52, (endH - startH) * HOUR_PX - 4);
                  return (
                    <Link
                      key={e.id}
                      href={`/events/${e.id}`}
                      data-cursor="open"
                      data-cursor-tone="ink"
                      className={`absolute left-1.5 right-1.5 overflow-hidden rounded-xl px-2.5 py-2 text-[12.5px] leading-[1.25] transition-opacity hover:opacity-85 ${blockTone(e.status)}`}
                      style={{ top, height }}
                    >
                      <div className="font-semibold line-clamp-2">{e.title}</div>
                      <div className="opacity-70 truncate">{timeSpan(e)}</div>
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

/* ─── Date helpers ─── */

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
