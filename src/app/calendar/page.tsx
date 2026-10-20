"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Nav } from "@/components/Nav";
import { StarCursor } from "@/components/StarCursor";
import type { MockEvent } from "@/lib/mock/events";
import { formatRange, parseKey, type Poll } from "@/lib/meet";
import { CATEGORY_LABEL, mergeItems, type CalendarCategory, type CalendarItem } from "@/lib/calendarItems";

type View = "schedule" | "month" | "week";

async function fetchEvents(): Promise<MockEvent[]> {
  const res = await fetch("/api/events?limit=200");
  if (!res.ok) throw new Error("failed");
  const data = await res.json();
  return data.events as MockEvent[];
}

async function fetchItems(): Promise<{ items: CalendarItem[]; source: string }> {
  const res = await fetch("/api/calendar/items?days=42");
  if (!res.ok) return { items: [], source: "none" };
  return (await res.json()) as { items: CalendarItem[]; source: string };
}

type PollRow = Poll & { responseCount: number };
async function fetchPolls(): Promise<PollRow[]> {
  const res = await fetch("/api/meet");
  if (!res.ok) return [];
  return ((await res.json()).polls as PollRow[]) ?? [];
}

/**
 * The calendar: only what is really on it. Your own Google Calendar
 * (classes, yoga, coffee chats) and the events you accepted in Lumi. Nothing
 * undecided, nothing that already happened. The default is a schedule with
 * full titles; month and week grids are there for orientation.
 *
 * Colour carries the category: classes blue, personal time green, coffee
 * chats yellow, Lumi's accepted events in ink, deadlines red.
 */
export default function CalendarPage() {
  const [view, setView] = useState<View>("schedule");
  const [cursor, setCursor] = useState(() => new Date());
  const { data: allEvents = [] } = useQuery({ queryKey: ["events"], queryFn: fetchEvents });
  const { data: own } = useQuery({ queryKey: ["calendar-items"], queryFn: fetchItems, refetchInterval: 5 * 60_000 });
  const { data: polls = [] } = useQuery({ queryKey: ["meet-list"], queryFn: fetchPolls });

  const now = Date.now();
  const items = useMemo(() => {
    const accepted = allEvents.filter((e) => e.status === "ACCEPTED");
    return mergeItems(own?.items ?? [], accepted).filter((i) => new Date(i.end).getTime() > now);
  }, [allEvents, own, now]);
  const fromLumi = items.filter((i) => i.source === "lumi").length;
  const undecided = allEvents.filter(
    (e) => (e.status === "PENDING" || e.status === "MAYBE") && new Date(e.startTime).getTime() > now
  ).length;

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
            <p className="animate-rise [animation-delay:80ms] inline-flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-lumi-muted">
              <span className="w-2 h-2 rounded-full bg-lumi-accent" />
              {items.length} coming up · {fromLumi} accepted in Lumi
              {undecided > 0 && (
                <>
                  {" · "}
                  <Link href="/dashboard" className="text-lumi-text font-semibold underline underline-offset-[3px]">
                    {undecided} still to decide
                  </Link>
                </>
              )}
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
          {view === "schedule" && <Schedule items={items} />}
          {view === "month" && <MonthGrid cursor={cursor} items={items} />}
          {view === "week" && <WeekGrid cursor={cursor} items={items} />}
        </div>

        <Legend />

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
      </main>
    </div>
  );
}

/* ─── Colour by category ─── */

const TONE: Record<CalendarCategory, { block: string; dot: string; text: string }> = {
  class: { block: "bg-[#DCE3FF] text-[#1F2E8A]", dot: "bg-[#2B4BFF]", text: "text-[#2B4BFF]" },
  personal: { block: "bg-[#DDF3E4] text-[#1F5A32]", dot: "bg-[#2E7D32]", text: "text-[#2E7D32]" },
  coffee: { block: "bg-lumi-mark text-lumi-text", dot: "bg-[#D9B800]", text: "text-[#8A7400]" },
  lumi: { block: "bg-lumi-text text-white", dot: "bg-lumi-text", text: "text-lumi-text" },
  deadline: { block: "bg-[#FFE4E4] text-lumi-rose", dot: "bg-lumi-rose", text: "text-lumi-rose" },
  other: { block: "bg-lumi-surface text-lumi-text", dot: "bg-lumi-subtle", text: "text-lumi-muted" },
};

function Dot({ category, className = "" }: { category: CalendarCategory; className?: string }) {
  return <span aria-hidden="true" className={`inline-block w-3 h-3 rounded-full shrink-0 ${TONE[category].dot} ${className}`} />;
}

function Legend() {
  const order: CalendarCategory[] = ["lumi", "class", "coffee", "personal", "deadline"];
  return (
    <p className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-lumi-muted">
      {order.map((c) => (
        <span key={c} className="inline-flex items-center gap-2">
          <Dot category={c} /> {CATEGORY_LABEL[c]}
        </span>
      ))}
    </p>
  );
}

function timeOf(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: d.getMinutes() ? "2-digit" : undefined });
}

function timeSpan(i: CalendarItem): string {
  return `${timeOf(i.start)}–${timeOf(i.end)}`;
}

/** Items are links when they are Lumi's; Google entries are just text. */
function ItemLink({
  item,
  className,
  style,
  children,
}: {
  item: CalendarItem;
  className: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  if (item.eventId) {
    return (
      <Link href={`/events/${item.eventId}`} data-cursor="open" data-cursor-tone="ink" className={className} style={style}>
        {children}
      </Link>
    );
  }
  return (
    <div className={className} style={style}>
      {children}
    </div>
  );
}

/* ─── Schedule: the default ─── */

function Schedule({ items }: { items: CalendarItem[] }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = dayKey(today);
  const thisWeek = weekStart(today).getTime();

  const byDay = new Map<string, CalendarItem[]>();
  for (const i of items) {
    const k = dayKey(new Date(i.start));
    byDay.set(k, [...(byDay.get(k) ?? []), i]);
  }
  if (!byDay.has(todayKey)) byDay.set(todayKey, []);
  const days = [...byDay.keys()].sort((a, b) => keyToDate(a).getTime() - keyToDate(b).getTime());

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

  let lastWeek = "";
  return (
    <div className="flex flex-col">
      {days.map((k) => {
        const date = keyToDate(k);
        const dayItems = byDay.get(k) ?? [];
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
                {dayItems.length === 0 && <li className="py-2 text-[15px] text-lumi-muted">Nothing on the calendar.</li>}
                {dayItems.map((i) => (
                  <li key={i.id}>
                    <ItemLink
                      item={i}
                      className="group grid grid-cols-[auto_1fr] sm:grid-cols-[auto_150px_1fr] gap-x-4 gap-y-1 items-start py-3 text-lumi-text"
                    >
                      <Dot category={i.category} className="mt-[7px]" />
                      <span className="text-[15px] font-semibold tabular-nums sm:text-lumi-muted sm:font-medium">{timeSpan(i)}</span>
                      <span className="col-start-2 sm:col-start-3 min-w-0 flex flex-col gap-0.5">
                        <span
                          className={`font-serif font-medium leading-[1.15] tracking-[-0.015em] transition-colors ${
                            i.source === "lumi" ? "text-[22px] sm:text-[24px] group-hover:text-lumi-accent" : "text-[19px] sm:text-[20px]"
                          }`}
                        >
                          {i.title}
                        </span>
                        <span className="text-sm text-lumi-muted">
                          {i.location && `${i.location} · `}
                          <span className={`font-semibold ${TONE[i.category].text}`}>{CATEGORY_LABEL[i.category]}</span>
                        </span>
                      </span>
                    </ItemLink>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        );
      })}
      <div className="border-t border-lumi-border pt-5 text-sm text-lumi-muted">
        That is everything for the next six weeks. Past days are gone; this page only looks forward.
      </div>
    </div>
  );
}

/* ─── Month ─── */

function MonthGrid({ cursor, items }: { cursor: Date; items: CalendarItem[] }) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const leading = first.getDay();
  const lastDay = new Date(year, month + 1, 0).getDate();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < leading; i++) cells.push(null);
  for (let d = 1; d <= lastDay; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const byDay = new Map<string, CalendarItem[]>();
  for (const i of items) {
    const k = dayKey(new Date(i.start));
    byDay.set(k, [...(byDay.get(k) ?? []), i]);
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = dayKey(today);

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
            if (!day) return <div key={i} className="min-h-[124px] border-b border-lumi-border" />;
            const key = dayKey(day);
            const past = day < today;
            const dayItems = past ? [] : (byDay.get(key) ?? []);
            const isToday = key === todayKey;
            return (
              <div key={i} className={`min-h-[124px] border-b border-lumi-border py-2.5 pr-2.5 flex flex-col gap-2 ${past ? "opacity-40" : ""}`}>
                <div
                  className={`font-serif font-serif-soft text-[20px] leading-none w-8 h-8 inline-flex items-center justify-center rounded-full ${
                    isToday ? "bg-lumi-accent text-white" : "text-lumi-text"
                  }`}
                >
                  {day.getDate()}
                </div>
                <ul className="flex flex-col gap-1">
                  {dayItems.map((it) => (
                    <li key={it.id}>
                      <ItemLink
                        item={it}
                        className={`block rounded-md px-2 py-1 text-[12px] leading-[1.3] transition-opacity hover:opacity-85 ${TONE[it.category].block}`}
                      >
                        <span className="opacity-70 tabular-nums">{timeOf(it.start)}</span>{" "}
                        <span className="font-semibold line-clamp-2">{it.title}</span>
                      </ItemLink>
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

function WeekGrid({ cursor, items }: { cursor: Date; items: CalendarItem[] }) {
  const start = weekStart(cursor);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
  const hours = Array.from({ length: 15 }, (_, i) => 7 + i); // 7 AM – 9 PM
  const HOUR_PX = 56;
  const todayKey = dayKey(new Date());
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const idx = days.findIndex((d) => dayKey(d) === todayKey);
    if (idx > 1 && scroller.current) scroller.current.scrollLeft = Math.max(0, idx - 1) * 150;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor]);

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
              {items
                .filter((i) => sameDay(new Date(i.start), d))
                .map((i) => {
                  const s = new Date(i.start);
                  const en = new Date(i.end);
                  const startH = s.getHours() + s.getMinutes() / 60;
                  const endH = en.getHours() + en.getMinutes() / 60;
                  if (startH < 7 || startH > 22) return null;
                  const top = (startH - 7) * HOUR_PX + 2;
                  const height = Math.max(44, (endH - startH) * HOUR_PX - 4);
                  return (
                    <ItemLink
                      key={i.id}
                      item={i}
                      style={{ top, height }}
                      className={`absolute left-1.5 right-1.5 overflow-hidden rounded-xl px-2.5 py-2 text-[12.5px] leading-[1.25] transition-opacity hover:opacity-85 ${TONE[i.category].block}`}
                    >
                      <div className="font-semibold line-clamp-2">{i.title}</div>
                      <div className="opacity-70 truncate">{timeSpan(i)}</div>
                    </ItemLink>
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

function keyToDate(k: string): Date {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m, d);
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
