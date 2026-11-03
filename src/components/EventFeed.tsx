"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { EventCard } from "@/components/EventCard";
import { buildBrief } from "@/lib/brief";
import Link from "next/link";
import { pendingOf, upcomingOf } from "@/lib/pending";
import { scanState } from "@/lib/scan";
import { DEFAULT_PROFILE, normalizeProfile, type UserProfile } from "@/lib/profile";
import type { MockEvent, EventStatus } from "@/lib/mock/events";

import { allDayDate } from "@/lib/zonedTime";
export { pendingOf };

async function fetchEvents(): Promise<MockEvent[]> {
  const res = await fetch("/api/events?limit=200");
  if (!res.ok) throw new Error("failed to fetch events");
  const data = await res.json();
  return data.events as MockEvent[];
}

/** The interest profile the stars were judged against. Demo mode has no user, so it gets the sample's rubric. */
async function fetchProfile(): Promise<UserProfile> {
  const res = await fetch("/api/profile");
  if (!res.ok) return DEFAULT_PROFILE;
  const data = (await res.json()) as { profile: unknown };
  return data.profile ? normalizeProfile(data.profile) : DEFAULT_PROFILE;
}

type ScanResult = { newEmails: number; eventsCreated: number; handshake?: { eventsCreated: number } };

async function postScan(): Promise<ScanResult> {
  const res = await fetch("/api/ingest/poll", { method: "POST" });
  if (!res.ok) throw new Error(`scan failed (${res.status})`);
  return (await res.json()) as ScanResult;
}

export type SkipReason = "not_interested" | "not_an_event" | "bad_time";

async function patchStatus(id: string, status: EventStatus, reason?: SkipReason): Promise<MockEvent> {
  const res = await fetch(`/api/events/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(reason ? { status, reason } : { status }),
  });
  if (!res.ok) throw new Error("failed to update status");
  const data = await res.json();
  return data.event;
}

/** The last decision, kept for a few seconds so a slip of the finger can be taken back. */
type LastDecision = { id: string; title: string; kind: MockEvent["kind"]; from: EventStatus; to: EventStatus };
const UNDO_WINDOW_MS = 10_000;

export function EventFeed({
  lastScan,
  gmailConnected = false,
  emailsThisWeek,
  cardsThisWeek,
}: {
  /** When Gmail was last pulled; the date line says so, and warns once a sweep has been missed. */
  lastScan?: string | null;
  gmailConnected?: boolean;
  emailsThisWeek?: number;
  cardsThisWeek?: number;
}) {
  const qc = useQueryClient();
  const { data: events = [], isLoading } = useQuery({
    queryKey: ["events"],
    queryFn: fetchEvents,
    // Keep the feed live: new mail lands and started events age out on their own.
    refetchInterval: 60_000,
  });
  const { data: profile = DEFAULT_PROFILE } = useQuery({
    queryKey: ["profile-for-stars"],
    queryFn: fetchProfile,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const scan = useMutation({
    mutationFn: postScan,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["sync-status"] });
      qc.invalidateQueries({ queryKey: ["metrics"] });
    },
  });
  const [focusIdx, setFocusIdx] = useState(0);
  const [last, setLast] = useState<LastDecision | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mutation = useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: EventStatus; reason?: SkipReason }) =>
      patchStatus(id, status, reason),
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
    (id: string, status: EventStatus, reason?: SkipReason) => {
      const before = events.find((e) => e.id === id);
      mutation.mutate({ id, status, reason });
      setFocusIdx((i) => Math.max(0, Math.min(i, pending.length - 2)));
      if (before && before.status !== status) {
        if (undoTimer.current) clearTimeout(undoTimer.current);
        setLast({ id, title: before.title, kind: before.kind, from: before.status, to: status });
        undoTimer.current = setTimeout(() => setLast(null), UNDO_WINDOW_MS);
      }
    },
    [events, mutation, pending.length]
  );

  /** Put the last decided card back exactly as it was. */
  const undo = useCallback(() => {
    if (!last) return;
    if (undoTimer.current) clearTimeout(undoTimer.current);
    mutation.mutate({ id: last.id, status: last.from });
    setLast(null);
  }, [last, mutation]);

  useEffect(
    () => () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    },
    []
  );

  // Keyboard shortcuts: j/k navigate, a/m/d act on the focused row, z takes the last one back.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
        return;
      }
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
          setStatus(focused.id, focused.status === "MAYBE" ? "PENDING" : "MAYBE");
          break;
        case "d":
          e.preventDefault();
          setStatus(focused.id, "DECLINED");
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, focusIdx, setStatus, undo]);

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const scanned = scanState(lastScan, gmailConnected);
  const behind = scanned.kind === "stale" || scanned.kind === "never";

  return (
    <div className="flex flex-col gap-8 sm:gap-10">
      <section className="flex flex-col items-start gap-2.5">
        <p className="animate-rise [animation-delay:80ms] inline-flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-lumi-muted">
          <span className={`w-2 h-2 rounded-full ${behind ? "bg-lumi-rose" : "bg-lumi-accent"}`} />
          <span>
            {today}
            {scanned.kind === "fresh" && ` · ${scanned.label}`}
            {typeof emailsThisWeek === "number" &&
              emailsThisWeek > 0 &&
              ` · Lumi read ${emailsThisWeek} emails this week and showed you ${cardsThisWeek ?? 0}`}
          </span>
          {behind && (
            <span role="status" className="inline-flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <span className="font-semibold text-lumi-rose">
                {scanned.kind === "never"
                  ? "Your inbox has not been read yet"
                  : `This list may be behind your inbox: ${scanned.label}`}
              </span>
              {scan.isError ? (
                <span className="text-lumi-rose">
                  Scan failed.{" "}
                  <Link href="/settings" className="font-semibold underline underline-offset-[3px] hover:text-lumi-text">
                    Try from Settings
                  </Link>
                </span>
              ) : (
                <button
                  onClick={() => scan.mutate()}
                  disabled={scan.isPending}
                  data-cursor="read my inbox"
                  data-cursor-tone="blue"
                  className="font-semibold text-lumi-accent underline underline-offset-[3px] transition-colors hover:text-lumi-text disabled:no-underline disabled:opacity-60"
                >
                  {scan.isPending ? "Scanning…" : "Scan now"}
                </button>
              )}
            </span>
          )}
          {scan.isSuccess && (
            <span className="text-lumi-text">
              {scanSummary(scan.data)}
            </span>
          )}
        </p>
        <h1 className="animate-rise [animation-delay:200ms] font-serif text-[26px] sm:text-[32px] font-normal leading-[1.15] tracking-[-0.02em] text-lumi-text max-w-[40ch]">
          {isLoading ? "Reading your inbox…" : <Headline text={brief.headline} emphasis={brief.emphasis} />}
        </h1>
        {!isLoading && (
          <p className="animate-rise [animation-delay:320ms] text-[15px] leading-[1.5] text-lumi-muted max-w-[60ch]">
            {brief.subline}
          </p>
        )}
      </section>

      {!isLoading && pending.length === 0 && <UpNext events={events} />}

      {!isLoading && pending.length > 0 && (
        <section className="flex flex-col border-b border-lumi-border">
          <AnimatePresence mode="popLayout">
            {pending.map((event, idx) => (
              <EventCard
                key={event.id}
                event={event}
                index={idx}
                focused={idx === focusIdx}
                profile={profile}
                onAction={setStatus}
              />
            ))}
          </AnimatePresence>
        </section>
      )}

      {/* The undo line. The outer div does the centring so framer's transform on the inner one cannot fight it. */}
      <div className="pointer-events-none fixed inset-x-4 bottom-6 z-40 flex justify-center">
        <AnimatePresence>
          {last && (
            <motion.div
              key={`${last.id}-${last.to}`}
              role="status"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16, transition: { duration: 0.15 } }}
              className="pointer-events-auto flex max-w-full items-center gap-3 rounded-full bg-lumi-text py-2.5 pl-5 pr-2 text-sm text-white shadow-[0_18px_40px_-16px_rgba(17,17,17,0.6)]"
            >
              <span className="min-w-0 truncate">
                <span className="font-semibold">{decisionVerb(last)}</span> {last.title}
              </span>
              <button
                onClick={undo}
                data-cursor="take it back"
                data-cursor-tone="ink"
                className="flex shrink-0 items-center gap-2 rounded-full bg-white/15 px-3.5 py-1.5 font-semibold transition-colors hover:bg-white/25"
              >
                Undo
                <kbd className="rounded border border-white/30 px-1.5 py-0.5 font-sans text-[11px] font-normal">Z</kbd>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/** "3 new emails, 1 new card" after a Scan now from the date line. */
function scanSummary(r: ScanResult): string {
  const cards = r.eventsCreated + (r.handshake?.eventsCreated ?? 0);
  const n = (count: number, word: string) => `${count} new ${word}${count === 1 ? "" : "s"}`;
  return `Scanned: ${n(r.newEmails, "email")}, ${n(cards, "card")}.`;
}

/** What the undo line says happened: "Skipped", "Attending", "Maybe for"… */
function decisionVerb({ to, kind }: LastDecision): string {
  switch (to) {
    case "ACCEPTED":
      return kind === "DEADLINE" ? "Reminder set for" : "Attending";
    case "MAYBE":
      return "Maybe for";
    case "DECLINED":
      return "Skipped";
    case "PENDING":
      return "Back to undecided:";
  }
}

/**
 * What the page shows once every card is decided: the next few things on
 * the calendar, so opening Lumi on a quiet morning still answers "what's
 * coming?". With nothing accepted yet it points at the ways mail gets in.
 */
function UpNext({ events }: { events: MockEvent[] }) {
  const next = useMemo(() => upcomingOf(events), [events]);

  if (next.length === 0) {
    return (
      <p className="animate-rise [animation-delay:400ms] max-w-[52ch] text-[15px] leading-relaxed text-lumi-muted">
        Nothing on your calendar yet. Forward a newsletter to your Lumi address, or connect
        Gmail and Handshake in{" "}
        <Link href="/settings" className="font-semibold text-lumi-accent underline underline-offset-[3px] hover:text-lumi-text">
          Settings
        </Link>
        .
      </p>
    );
  }

  return (
    <section className="animate-rise [animation-delay:400ms] flex flex-col gap-4">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lumi-subtle">Coming up</p>
      <ol className="flex flex-col border-t border-lumi-border">
        {next.map((e) => (
          <li
            key={e.id}
            className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-x-6 gap-y-1 border-b border-lumi-border py-5"
          >
            <span className="text-[15px] font-semibold tabular-nums text-lumi-text">{e.isAllDay ? `${allDayDate(e.startTime, e.timezone)} · All day` : whenLabel(e.startTime)}</span>
            <div className="min-w-0">
              <Link
                href={`/events/${e.id}`}
                data-cursor="open"
                data-cursor-tone="ink"
                className="font-serif text-[22px] font-medium leading-tight tracking-[-0.02em] text-lumi-text transition-colors hover:text-lumi-accent"
              >
                {e.title}
              </Link>
              {e.locationName && <p className="mt-1 text-sm text-lumi-muted">{e.locationName}</p>}
            </div>
          </li>
        ))}
      </ol>
      <Link
        href="/calendar"
        data-cursor="calendar"
        data-cursor-tone="blue"
        className="self-start text-sm font-semibold text-lumi-accent underline underline-offset-[3px] hover:text-lumi-text"
      >
        Full calendar →
      </Link>
    </section>
  );
}

function whenLabel(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: d.getMinutes() ? "2-digit" : undefined });
  return `${day} · ${time}`;
}

/** The headline with one word under a highlighter stroke. */
function Headline({ text, emphasis }: { text: string; emphasis: string | null }) {
  if (!emphasis) return <>{text}</>;
  const at = text.toLowerCase().indexOf(emphasis.toLowerCase());
  if (at < 0) return <>{text}</>;
  const before = text.slice(0, at);
  const word = text.slice(at, at + emphasis.length);
  const rest = text.slice(at + emphasis.length);
  // Punctuation right after the word stays inside the inline block, so a
  // narrow screen never wraps a lone full stop onto the next line.
  const tail = rest.match(/^[.,!?;:]+/)?.[0] ?? "";
  const after = rest.slice(tail.length);
  return (
    <>
      {before}
      <span className="relative inline-block italic font-medium">
        <span
          aria-hidden="true"
          className="animate-mark absolute -left-0.5 -right-1 bottom-[3px] h-[36%] rounded-sm bg-lumi-mark origin-left"
        />
        <span className="relative">{word}</span>
        {tail && <span className="relative not-italic font-normal">{tail}</span>}
      </span>
      {after}
    </>
  );
}
