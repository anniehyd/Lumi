"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Props = { eventDates: string[] /* ISO start times */ };

export function MiniCalendar({ eventDates }: Props) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });

  const { label, days } = useMemo(() => buildMonth(cursor), [cursor]);
  const dotSet = useMemo(() => {
    const set = new Set<string>();
    for (const iso of eventDates) {
      const d = new Date(iso);
      set.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
    }
    return set;
  }, [eventDates]);

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;

  return (
    <div className="rounded-xl border border-lumi-border bg-lumi-surface p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-serif text-base text-lumi-text">{label}</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCursor((d) => shift(d, -1))}
            className="p-1 rounded hover:bg-lumi-surface-hover text-lumi-muted"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setCursor((d) => shift(d, 1))}
            className="p-1 rounded hover:bg-lumi-surface-hover text-lumi-muted"
            aria-label="Next month"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center mb-1">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i} className="text-[10px] font-medium text-lumi-subtle py-0.5">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day, i) => {
          if (!day) return <div key={i} />;
          const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
          const hasEvent = dotSet.has(key);
          const isToday = key === todayKey;
          return (
            <div
              key={i}
              className={`aspect-square flex flex-col items-center justify-center rounded text-xs relative ${
                isToday
                  ? "bg-lumi-accent text-lumi-bg font-semibold"
                  : "text-lumi-muted hover:bg-lumi-surface-hover"
              }`}
            >
              {day.getDate()}
              {hasEvent && !isToday && (
                <div className="absolute bottom-0.5 w-1 h-1 rounded-full bg-lumi-accent" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function buildMonth(cursor: Date): { label: string; days: (Date | null)[] } {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const label = cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const first = new Date(year, month, 1);
  const leading = first.getDay();
  const lastDay = new Date(year, month + 1, 0).getDate();

  const days: (Date | null)[] = [];
  for (let i = 0; i < leading; i++) days.push(null);
  for (let d = 1; d <= lastDay; d++) days.push(new Date(year, month, d));
  while (days.length % 7 !== 0) days.push(null);

  return { label, days };
}

function shift(d: Date, months: number): Date {
  const next = new Date(d);
  next.setMonth(next.getMonth() + months);
  return next;
}
