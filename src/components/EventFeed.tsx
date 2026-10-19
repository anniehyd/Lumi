"use client";

import { AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { EventCard } from "@/components/EventCard";
import { buildBrief } from "@/lib/brief";
import type { MockEvent, EventStatus } from "@/lib/mock/events";

async function fetchEvents(): Promise<MockEvent[]> {
  const res = await fetch("/api/events?limit=200");
  if (!res.ok) throw new Error("failed to fetch events");
  const data = await res.json();
  return data.events as MockEvent[];
}

async function patchStatus(id: string, status: EventStatus): Promise<MockEvent> {
  const res = await fetch(`/api/events/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error("failed to update status");
  const data = await res.json();
  return data.event;
}

/** Only undecided, still-upcoming events; most relevant first, soonest within a rating. */
export function pendingOf(events: MockEvent[], now = Date.now()): MockEvent[] {
  return events
    .filter((e) => e.status === "PENDING" || e.status === "MAYBE")
    .filter((e) => new Date(e.startTime).getTime() > now)
    .sort((a, b) => (b.relevance ?? 3) - (a.relevance ?? 3) || a.startTime.localeCompare(b.startTime));
}

export function EventFeed({ lastScan }: { lastScan?: string | null }) {
  const qc = useQueryClient();
  const { data: events = [], isLoading } = useQuery({
    queryKey: ["events"],
    queryFn: fetchEvents,
    // Keep the feed live: new mail lands and started events age out on their own.
    refetchInterval: 60_000,
  });
  const [focusIdx, setFocusIdx] = useState(0);

  const mutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: EventStatus }) => patchStatus(id, status),
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: ["events"] });
      const prev = qc.getQueryData<MockEvent[]>(["events"]);
      qc.setQueryData<MockEvent[]>(["events"], (old) =>
        (old ?? []).map((e) => (e.id === id ? { ...e, status } : e))
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(["events"], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["events"] }),
  });

  const pending = useMemo(() => pendingOf(events), [events]);
  const brief = useMemo(() => buildBrief(pending), [pending]);

  const setStatus = useCallback(
    (id: string, status: EventStatus) => {
      mutation.mutate({ id, status });
      setFocusIdx((i) => Math.max(0, Math.min(i, pending.length - 2)));
    },
    [mutation, pending.length]
  );

  // Keyboard shortcuts: j/k navigate, a/m/d act on the focused row.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (pending.length === 0) return;
      const focused = pending[focusIdx];
      if (!focused) return;
      switch (e.key.toLowerCase()) {
        case "j":
        case "arrowdown":
          e.preventDefault();
          setFocusIdx((i) => Math.min(i + 1, pending.length - 1));
          break;
        case "k":
        case "arrowup":
          e.preventDefault();
          setFocusIdx((i) => Math.max(i - 1, 0));
          break;
        case "a":
          e.preventDefault();
          setStatus(focused.id, "ACCEPTED");
          break;
        case "m":
          e.preventDefault();
          setStatus(focused.id, "MAYBE");
          break;
        case "d":
          e.preventDefault();
          setStatus(focused.id, "DECLINED");
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, focusIdx, setStatus]);

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const scanned = lastScan
    ? new Date(lastScan).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : null;

  return (
    <div className="flex flex-col gap-14 sm:gap-16">
      <section className="flex flex-col items-start gap-5">
        <p className="animate-rise [animation-delay:80ms] inline-flex items-center gap-2.5 text-sm text-lumi-muted">
          <span className="w-2 h-2 rounded-full bg-lumi-accent" />
          {today}
          {scanned && ` · scanned at ${scanned}`}
          {pending.length > 0 && ` · ${pending.length} to decide`}
        </p>
        <h1 className="animate-rise [animation-delay:200ms] font-serif text-[40px] sm:text-[60px] font-normal leading-[1] tracking-[-0.03em] text-lumi-text max-w-[16ch]">
          {isLoading ? "Reading your inbox…" : <Headline text={brief.headline} emphasis={brief.emphasis} />}
        </h1>
        {!isLoading && (
          <p className="animate-rise [animation-delay:320ms] text-lg sm:text-xl leading-[1.45] text-[#4A4A4A] max-w-[42ch]">
            {brief.subline}
          </p>
        )}
      </section>

      {!isLoading && pending.length > 0 && (
        <section className="flex flex-col border-b border-lumi-border">
          <AnimatePresence mode="popLayout">
            {pending.map((event, idx) => (
              <EventCard
                key={event.id}
                event={event}
                index={idx}
                focused={idx === focusIdx}
                onAction={setStatus}
              />
            ))}
          </AnimatePresence>
        </section>
      )}
    </div>
  );
}

/** The headline with one word under a highlighter stroke. */
function Headline({ text, emphasis }: { text: string; emphasis: string | null }) {
  if (!emphasis) return <>{text}</>;
  const at = text.toLowerCase().indexOf(emphasis.toLowerCase());
  if (at < 0) return <>{text}</>;
  const before = text.slice(0, at);
  const word = text.slice(at, at + emphasis.length);
  const after = text.slice(at + emphasis.length);
  return (
    <>
      {before}
      <span className="relative inline-block italic font-medium">
        <span
          aria-hidden="true"
          className="animate-mark absolute -left-1 -right-1.5 bottom-[10px] h-[34%] rounded bg-lumi-mark origin-left"
        />
        <span className="relative">{word}</span>
      </span>
      {after}
    </>
  );
}
