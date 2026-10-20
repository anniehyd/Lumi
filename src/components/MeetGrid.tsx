"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatClock, formatDay, parseKey, slotKey, slotTimes, type Poll } from "@/lib/meet";

type GridPoll = Pick<Poll, "days" | "dayStart" | "dayEnd" | "slotMinutes">;

type PaintProps = {
  mode: "paint";
  poll: GridPoll;
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  highlight?: { start: string; end: string } | null;
};

type HeatProps = {
  mode: "heat";
  poll: GridPoll;
  tally: Map<string, string[]>;
  total: number;
  onHover?: (key: string | null) => void;
  highlight?: { start: string; end: string } | null;
};

/**
 * The When2meet grid: days across, times down.
 *
 * Paint mode: press and drag to mark the slots you are free for; the first
 * cell decides whether the drag adds or removes, so a stroke never flips
 * half-way. Works with a finger too (pointer events, no touch scrolling
 * inside the grid).
 *
 * Heat mode: each cell's ink is how many people are free then; hover to see
 * who. A highlighted range outlines the time that was picked.
 */
export function MeetGrid(props: PaintProps | HeatProps) {
  const { poll, highlight } = props;
  const times = slotTimes(poll);
  const painting = useRef<{ value: boolean; touched: Set<string> } | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  const inHighlight = useCallback(
    (key: string) => {
      if (!highlight) return false;
      const k = parseKey(key);
      const s = parseKey(highlight.start);
      const e = parseKey(highlight.end);
      return Boolean(k && s && e && k.day === s.day && k.minutes >= s.minutes && k.minutes < e.minutes);
    },
    [highlight]
  );

  const apply = useCallback(
    (key: string) => {
      if (props.mode !== "paint" || !painting.current) return;
      if (painting.current.touched.has(key)) return;
      painting.current.touched.add(key);
      const next = new Set(props.selected);
      if (painting.current.value) next.add(key);
      else next.delete(key);
      props.onChange(next);
    },
    [props]
  );

  useEffect(() => {
    const stop = () => {
      painting.current = null;
    };
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, []);

  const keyAt = (x: number, y: number): string | null => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    return el?.closest<HTMLElement>("[data-key]")?.dataset.key ?? null;
  };

  return (
    <div
      className="select-none"
      style={{ touchAction: props.mode === "paint" ? "none" : "auto" }}
      onPointerDown={(e) => {
        if (props.mode !== "paint") return;
        const key = keyAt(e.clientX, e.clientY);
        if (!key) return;
        e.preventDefault();
        painting.current = { value: !props.selected.has(key), touched: new Set() };
        apply(key);
      }}
      onPointerMove={(e) => {
        const key = keyAt(e.clientX, e.clientY);
        if (props.mode === "paint") {
          if (painting.current && key) apply(key);
        } else if (key !== hovered) {
          setHovered(key);
          props.onHover?.(key);
        }
      }}
      onPointerLeave={() => {
        if (props.mode === "heat") {
          setHovered(null);
          props.onHover?.(null);
        }
      }}
    >
      <div
        className="grid gap-x-1"
        style={{ gridTemplateColumns: `56px repeat(${poll.days.length}, minmax(36px, 1fr))` }}
      >
        <div />
        {poll.days.map((d) => (
          <div key={d} className="pb-2 text-center leading-tight">
            <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-lumi-subtle">
              {formatDay(d, { weekday: "short" }).split(",")[0]}
            </div>
            <div className="font-serif font-serif-soft text-[18px] text-lumi-text">
              {parseInt(d.slice(8), 10)}
            </div>
          </div>
        ))}

        {times.map((t) => {
          const hourLine = t % 60 === 0;
          return [
            <div
              key={`t-${t}`}
              className={`pr-2 text-right text-[11px] text-lumi-subtle leading-none ${hourLine ? "" : "opacity-0"}`}
              style={{ height: 22, transform: "translateY(-6px)" }}
            >
              {hourLine ? formatClock(t) : "·"}
            </div>,
            ...poll.days.map((d) => {
              const key = slotKey(d, t);
              const hi = inHighlight(key);
              let style: React.CSSProperties = {};
              let cls = "";
              if (props.mode === "paint") {
                const on = props.selected.has(key);
                cls = on ? "bg-lumi-text" : "bg-lumi-surface hover:bg-lumi-surface-hover";
              } else {
                const n = props.tally.get(key)?.length ?? 0;
                const share = props.total ? n / props.total : 0;
                style = { backgroundColor: n ? `rgba(17,17,17,${0.12 + 0.88 * share})` : undefined };
                cls = n ? "" : "bg-lumi-surface";
                if (hovered === key) cls += " ring-2 ring-lumi-accent ring-inset";
              }
              return (
                <div
                  key={key}
                  data-key={key}
                  role={props.mode === "paint" ? "checkbox" : undefined}
                  aria-checked={props.mode === "paint" ? props.selected.has(key) : undefined}
                  aria-label={`${formatDay(d)} ${formatClock(t)}`}
                  className={`h-[22px] cursor-pointer transition-colors duration-100 ${cls} ${
                    hourLine ? "border-t border-white" : "border-t border-white/60"
                  } ${hi ? "outline outline-2 outline-lumi-accent -outline-offset-2" : ""}`}
                  style={style}
                />
              );
            }),
          ];
        })}
      </div>
    </div>
  );
}
