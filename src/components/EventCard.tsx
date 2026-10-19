"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import type { MockEvent, EventStatus } from "@/lib/mock/events";
import { summaryFor } from "@/lib/brief";

type Props = {
  event: MockEvent;
  index: number;
  focused?: boolean;
  onAction: (id: string, status: EventStatus) => void;
};

function dayLabel(startISO: string, endISO?: string): string {
  const start = new Date(startISO);
  const day = start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const t = (d: Date) =>
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: d.getMinutes() ? "2-digit" : undefined });
  if (!endISO) return `${day} · ${t(start)}`;
  return `${day} · ${t(start)}–${t(new Date(endISO))}`;
}

/** Five stars, filled to the relevance score. */
function Stars({ value }: { value: number }) {
  const v = Math.min(5, Math.max(1, Math.round(value)));
  return (
    <span
      className="inline-flex items-center gap-0.5"
      role="img"
      aria-label={`${v} of 5 stars for you`}
      title={`${v} of 5: how well this fits what you told Lumi you care about`}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <svg
          key={i}
          width="15"
          height="15"
          viewBox="0 0 24 24"
          aria-hidden="true"
          className={i <= v ? "text-lumi-text" : "text-[#DDDBD5]"}
          fill="currentColor"
        >
          <path d="M12 2.5l2.9 6.1 6.7.8-4.9 4.6 1.3 6.6L12 17.3l-6 3.3 1.3-6.6L2.4 9.4l6.7-.8L12 2.5z" />
        </svg>
      ))}
    </span>
  );
}

/**
 * One row of the decision list. What a person needs to decide, nothing
 * else: title, when, where, who invited them, how well it fits (stars), one
 * sentence on what it is, whether an RSVP is needed, and a red line only
 * when it overlaps their calendar. The email itself lives one click away
 * on the event page.
 */
export function EventCard({ event, index, focused, onAction }: Props) {
  const deadline = event.kind === "DEADLINE";
  const primaryLabel = deadline ? "Remind me" : "Attend";
  const summary = event.summary ?? summaryFor(event);
  const host = event.organizerCompany ?? event.organizerName;
  const sender = event.organizerName && event.organizerName !== host ? event.organizerName : null;
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

      <div className="min-w-0 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Stars value={event.relevance ?? 3} />
          {deadline && (
            <span className="rounded-full bg-lumi-surface px-2.5 py-1 text-[12px] font-semibold text-lumi-text">Deadline</span>
          )}
        </div>

        <Link href={`/events/${event.id}`} className="inline-block" data-cursor="open" data-cursor-tone="ink">
          <h2
            className={`font-serif font-medium leading-[1.06] tracking-[-0.025em] text-lumi-text transition-colors hover:text-lumi-accent ${
              lead ? "text-[32px] sm:text-[40px]" : "text-[26px] sm:text-[32px]"
            }`}
          >
            {event.title}
          </h2>
        </Link>

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[15px]">
          <dt className="text-lumi-subtle">When</dt>
          <dd className="font-semibold text-lumi-text tabular-nums">{dayLabel(event.startTime, event.endTime)}</dd>
          {event.locationName && (
            <>
              <dt className="text-lumi-subtle">Where</dt>
              <dd className="text-lumi-text">
                {event.locationName}
                {event.locationAddress && <span className="text-lumi-muted"> · {event.locationAddress}</span>}
              </dd>
            </>
          )}
          {host && (
            <>
              <dt className="text-lumi-subtle">Host</dt>
              <dd className="text-lumi-text">
                {host}
                {sender && <span className="text-lumi-muted"> · invite via {sender}</span>}
              </dd>
            </>
          )}
        </dl>

        <p className={`text-lumi-text leading-relaxed max-w-[62ch] ${lead ? "text-[17px]" : "text-base"}`}>{summary}</p>

        {event.rsvpLink && (
          <p className="text-[15px]">
            <span className="font-semibold text-lumi-text">RSVP needed · </span>
            <a
              href={event.rsvpLink}
              target="_blank"
              rel="noreferrer"
              data-cursor="rsvp"
              data-cursor-tone="blue"
              className="font-semibold text-lumi-accent underline underline-offset-[3px] hover:text-lumi-text"
            >
              {rsvpHost(event.rsvpLink)}
            </a>
          </p>
        )}

        {event.conflictTitle && (
          <p className="inline-flex items-center gap-2 self-start rounded-lg bg-[#FFE4E4] px-3 py-1.5 text-[14px] font-semibold text-lumi-rose">
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
            Overlaps {event.conflictTitle} on your calendar
          </p>
        )}
      </div>

      <div className="flex sm:flex-col flex-wrap gap-2 sm:min-w-[132px]">
        <button
          onClick={() => onAction(event.id, "ACCEPTED")}
          data-cursor={deadline ? "set a reminder" : "attend?"}
          data-cursor-tone={deadline ? "blue" : "mark"}
          className={`min-h-[46px] rounded-full px-5 text-sm font-semibold transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:scale-[1.03] hover:shadow-[0_10px_24px_-14px_rgba(17,17,17,0.45)] active:scale-[0.98] ${
            lead ? "bg-lumi-text text-white" : "border-[1.5px] border-lumi-text bg-white text-lumi-text"
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

/** "nyu.joinhandshake.com" rather than a 90-character tracking URL. */
function rsvpHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "open the RSVP link";
  }
}
