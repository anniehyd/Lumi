"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Inbox, Sparkles, Loader2 } from "lucide-react";
import { EventCard } from "@/components/EventCard";
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

export function EventFeed() {
  const qc = useQueryClient();
  const { data: events = [], isLoading } = useQuery({
    queryKey: ["events"],
    queryFn: fetchEvents,
  });
  const [focusIdx, setFocusIdx] = useState(0);

  const mutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: EventStatus }) =>
      patchStatus(id, status),
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

  const pending = useMemo(
    () =>
      events
        .filter((e) => e.status === "PENDING")
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [events]
  );
  const resolved = useMemo(
    () => events.filter((e) => e.status !== "PENDING"),
    [events]
  );

  function setStatus(id: string, status: EventStatus) {
    mutation.mutate({ id, status });
    setFocusIdx((i) => Math.min(i, pending.length - 2));
  }

  // Keyboard shortcuts: j/k navigate, a/m/d act on focused card
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
  }, [pending, focusIdx]);

  return (
    <div className="flex flex-col gap-6 overflow-y-auto pr-1">
      {/* Header row */}
      <div className="flex items-baseline justify-between">
        <div>
          <h2 className="font-serif text-3xl text-lumi-text">Inbox</h2>
          <p className="text-sm text-lumi-muted mt-1">
            {pending.length} event{pending.length === 1 ? "" : "s"} awaiting your decision
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-lumi-subtle">
          <Sparkles className="w-3.5 h-3.5 text-lumi-accent" />
          <span>Extracted by Lumi</span>
        </div>
      </div>

      {/* Pending */}
      {isLoading ? (
        <LoadingState />
      ) : pending.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="flex flex-col gap-3">
          <AnimatePresence mode="popLayout">
            {pending.map((event, idx) => (
              <EventCard
                key={event.id}
                event={event}
                focused={idx === focusIdx}
                onAction={setStatus}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Resolved */}
      {resolved.length > 0 && (
        <div className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-lumi-subtle mb-3">
            Resolved
          </h3>
          <div className="flex flex-col gap-2">
            {resolved.map((e) => (
              <ResolvedRow key={e.id} event={e} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12 text-sm text-lumi-muted">
      <Loader2 className="w-4 h-4 animate-spin mr-2" />
      Loading your inbox…
    </div>
  );
}

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-20 text-center"
    >
      <div className="w-14 h-14 rounded-full border border-lumi-border flex items-center justify-center mb-4">
        <Inbox className="w-6 h-6 text-lumi-subtle" />
      </div>
      <h3 className="font-serif text-xl text-lumi-text">All clear.</h3>
      <p className="text-sm text-lumi-muted mt-1 max-w-xs">
        Lumi will surface new invites here as they arrive.
      </p>
    </motion.div>
  );
}

function ResolvedRow({ event }: { event: MockEvent }) {
  const statusLabel = {
    ACCEPTED: { label: "Attending", color: "text-lumi-green" },
    MAYBE: { label: "Maybe", color: "text-lumi-muted" },
    DECLINED: { label: "Declined", color: "text-lumi-subtle line-through" },
    PENDING: { label: "", color: "" },
  }[event.status];
  const start = new Date(event.startTime);
  return (
    <div className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-lumi-surface transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <span className={`text-xs font-medium ${statusLabel.color} w-20 shrink-0`}>
          {statusLabel.label}
        </span>
        <span className="text-sm text-lumi-text truncate">{event.title}</span>
      </div>
      <span className="text-xs text-lumi-subtle shrink-0 ml-4">
        {start.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
      </span>
    </div>
  );
}
