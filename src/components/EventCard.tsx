"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { MockEvent, MockEmail, EventStatus } from "@/lib/mock/events";
import { summaryFor } from "@/lib/brief";

type Props = {
  event: MockEvent;
  index: number;
  focused?: boolean;
  onAction: (id: string, status: EventStatus) => void;
};

async function fetchEmail(id: string): Promise<MockEmail | null> {
  const res = await fetch(`/api/emails/${id}`);
  if (!res.ok) return null;
  return ((await res.json()).email as MockEmail) ?? null;
}

function dayLabel(startISO: string, endISO?: string): string {
  const start = new Date(startISO);
  const day = start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const t = (d: Date) =>
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: d.getMinutes() ? "2-digit" : undefined }).replace(" ", " ");
  if (!endISO) return `${day} · ${t(start)}`;
  return `${day} · ${t(start)}–${t(new Date(endISO))}`;
}

function matchLabel(relevance: number): { text: string; tone: "mark" | "plain" | "faint" } {
  if (relevance >= 4) return { text: "Strong match", tone: "mark" };
  if (relevance === 3) return { text: "Fair match", tone: "plain" };
  return { text: "Outside your lane", tone: "faint" };
}

const pillTone = {
  mark: "bg-lumi-mark text-lumi-text",
  plain: "bg-lumi-surface text-lumi-text",
  faint: "bg-lumi-surface text-lumi-muted",
  ink: "bg-lumi-text text-white",
  rose: "bg-[#FFE4E4] text-lumi-rose",
};

function Pill({ tone, children }: { tone: keyof typeof pillTone; children: React.ReactNode }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[13px] font-semibold transition-transform hover:-rotate-3 hover:scale-105 ${pillTone[tone]}`}
    >
      {children}
    </span>
  );
}

/**
 * One row of the decision list. The row leads with a plain-English sentence
 * ("Looks like …") rather than the raw title, because that sentence is what a
 * person actually needs to decide; the title and the source paragraph are
 * there when they want to check.
 */
export function EventCard({ event, index, focused, onAction }: Props) {
  const [expanded, setExpanded] = useState(false);
  const { data: email } = useQuery({
    queryKey: ["email", event.sourceEmailId],
    queryFn: () => fetchEmail(event.sourceEmailId),
    enabled: expanded && Boolean(event.sourceEmailId),
    staleTime: Infinity,
  });

  // The focused row opens its source so the keyboard flow never needs the mouse.
  useEffect(() => {
    if (focused) setExpanded(true);
  }, [focused]);

  const relevance = event.relevance ?? 3;
  const match = matchLabel(relevance);
  const unsure = event.confidence < 0.7 && event.detectedVia !== "ICS";
  const deadline = event.kind === "DEADLINE";
  const primaryLabel = deadline ? "Remind me" : "Attend";
  const summary = event.summary ?? summaryFor(event);
  const host = event.organizerCompany ?? event.organizerName;
  const lead = focused || index === 0;

  return (
    <motion.article
      layout
      exit={{ opacity: 0, x: 40, transition: { duration: 0.18 } }}
      style={{ animationDelay: `${Math.min(index, 6) * 90 + 380}ms` }}
      className={`animate-rise group -mx-6 grid grid-cols-1 sm:grid-cols-[96px_1fr_auto] gap-y-4 sm:gap-7 items-start rounded-[20px] px-6 py-8 sm:py-9 border-t border-lumi-border transition-[background-color,transform] duration-300 hover:bg-[#FAFAF7] hover:translate-x-1 ${
        focused ? "bg-[#FAFAF7]" : ""
      }`}
    >
      <div
        aria-hidden="true"
        className={`font-serif font-serif-soft text-[40px] sm:text-[64px] font-light leading-[0.9] tracking-[-0.04em] -mb-1 sm:mb-0 transition-[color,transform] duration-300 group-hover:text-lumi-accent group-hover:-translate-y-1 group-hover:-rotate-6 ${
          focused ? "text-lumi-accent" : "text-[#C9C7C1]"
        }`}
      >
        {String(index + 1).padStart(2, "0")}
      </div>

      <div className="min-w-0 flex flex-col gap-3.5">
        <div className="flex flex-wrap gap-2.5">
          <Pill tone="ink">{dayLabel(event.startTime, event.endTime)}</Pill>
          {deadline ? <Pill tone="plain">Deadline</Pill> : <Pill tone={match.tone}>{match.text}</Pill>}
          {event.conflictTitle && <Pill tone="rose">Overlaps {event.conflictTitle}</Pill>}
          {unsure && <Pill tone="faint">Not sure it’s an event</Pill>}
        </div>

        <Link href={`/events/${event.id}`} className="inline-block">
          <h2
            className={`font-serif font-medium leading-[1.06] tracking-[-0.025em] text-lumi-text transition-colors hover:text-lumi-accent ${
              lead ? "text-[34px] sm:text-[44px]" : "text-[28px] sm:text-[34px]"
            }`}
          >
            {event.title}
          </h2>
        </Link>

        <p className={`text-lumi-text leading-relaxed ${lead ? "text-[17px]" : "text-base"}`}>
          <em className="font-serif font-serif-soft text-[1.12em]">Looks like</em>{" "}
          {summary.replace(/^looks like\s*/i, "")}
        </p>

        {(event.locationName || host) && (
          <p className="text-sm text-lumi-muted">
            {[event.locationName, host && `hosted by ${host}`].filter(Boolean).join(" · ")}
          </p>
        )}

        {event.sourceEmailId && !expanded && (
          <button
            onClick={() => setExpanded(true)}
            className="self-start text-[13px] font-semibold text-lumi-accent underline underline-offset-[3px] hover:text-lumi-text"
          >
            Show where this came from
          </button>
        )}

        {expanded && email && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-1 rounded-2xl bg-lumi-surface px-5 py-5 flex flex-col gap-2.5"
          >
            <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-[13px] text-lumi-muted">
              <span className="font-semibold text-lumi-text">From {email.fromName}</span>
              <span>
                “{email.subject}” ·{" "}
                {new Date(email.receivedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            </div>
            <p className="font-serif font-serif-soft text-[15px] leading-[1.6] text-[#3A3A3A] line-clamp-4 whitespace-pre-line">
              {excerptFor(email.bodyText, event.title)}
            </p>
            <Link
              href={`/events/${event.id}`}
              className="self-start text-[13px] font-semibold text-lumi-accent underline underline-offset-[3px] hover:text-lumi-text"
            >
              Open the whole email
            </Link>
          </motion.div>
        )}
      </div>

      <div className="flex sm:flex-col flex-wrap gap-2 sm:min-w-[132px]">
        <button
          onClick={() => onAction(event.id, "ACCEPTED")}
          data-cursor={deadline ? "set a reminder" : "attend?"}
          data-cursor-tone={deadline ? "blue" : "mark"}
          className={`min-h-[46px] rounded-full px-5 text-sm font-semibold transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:scale-[1.03] hover:shadow-[0_10px_24px_-14px_rgba(17,17,17,0.45)] active:scale-[0.98] ${
            lead
              ? "bg-lumi-text text-white"
              : "border-[1.5px] border-lumi-text bg-white text-lumi-text"
          }`}
        >
          {primaryLabel}
          {lead && " →"}
        </button>
        <button
          onClick={() => onAction(event.id, "MAYBE")}
          data-cursor="maybe later"
          data-cursor-tone="ink"
          className="min-h-[44px] rounded-full bg-lumi-surface px-5 text-sm font-semibold text-lumi-text transition-transform duration-200 hover:-translate-y-0.5 hover:scale-[1.03] active:scale-[0.98]"
        >
          Maybe
        </button>
        <button
          onClick={() => onAction(event.id, "DECLINED")}
          data-cursor="skip this one"
          data-cursor-tone="ink"
          className="min-h-[44px] rounded-full px-4 text-sm font-semibold text-lumi-muted transition-colors hover:text-lumi-text"
        >
          Skip
        </button>
      </div>
    </motion.article>
  );
}

/**
 * The paragraph of the email that mentions this event, so the panel reads as
 * "here is the line Lumi found" rather than a wall of newsletter.
 */
function excerptFor(body: string, title: string): string {
  const paragraphs = body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const words = title
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3);
  let best = paragraphs[0] ?? body;
  let bestScore = 0;
  for (const p of paragraphs) {
    const lower = p.toLowerCase();
    const score = words.filter((w) => lower.includes(w)).length;
    if (score > bestScore) {
      best = p;
      bestScore = score;
    }
  }
  return best.length > 420 ? best.slice(0, 417).trimEnd() + "…" : best;
}
