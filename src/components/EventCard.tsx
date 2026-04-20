"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import {
  Calendar,
  MapPin,
  Building2,
  Sparkles,
  FileText,
  Mail,
  ChevronRight,
  Check,
  X,
  CircleHelp,
  AlertCircle,
} from "lucide-react";
import { useState } from "react";
import type { MockEvent, EventStatus } from "@/lib/mock/events";
import { getEmailById } from "@/lib/mock/events";

type Props = {
  event: MockEvent;
  focused?: boolean;
  onAction: (id: string, status: EventStatus) => void;
};

const kindLabels: Record<MockEvent["kind"], { label: string; tone: string }> = {
  MEETING: { label: "Meeting", tone: "text-lumi-blue" },
  INFO_SESSION: { label: "Info Session", tone: "text-lumi-accent" },
  DEADLINE: { label: "Deadline", tone: "text-lumi-rose" },
  COFFEE_CHAT: { label: "Coffee Chat", tone: "text-lumi-green" },
};

const detectionLabels: Record<MockEvent["detectedVia"], string> = {
  ICS: "Calendar attachment",
  SCHEMA_ORG: "Structured markup",
  KEYWORD: "Keyword match",
  LLM: "AI extraction",
};

function formatWhen(startISO: string, endISO?: string): string {
  const start = new Date(startISO);
  const dateStr = start.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const startTime = start.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  if (!endISO) return `${dateStr} · ${startTime}`;
  const end = new Date(endISO);
  const endTime = end.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${dateStr} · ${startTime}–${endTime}`;
}

export function EventCard({ event, focused, onAction }: Props) {
  const [expanded, setExpanded] = useState(false);
  const email = getEmailById(event.sourceEmailId);
  const kind = kindLabels[event.kind];
  const isLowConfidence = event.confidence < 0.9 && event.detectedVia !== "ICS";

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={`group relative rounded-xl border bg-lumi-surface transition-all ${
        focused
          ? "border-lumi-accent shadow-[0_0_0_3px_rgba(232,160,78,0.12)]"
          : "border-lumi-border hover:border-lumi-subtle"
      }`}
    >
      {/* Kind stripe + confidence chip */}
      <div className="flex items-center justify-between px-5 pt-4">
        <div className={`flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider ${kind.tone}`}>
          <Sparkles className="w-3 h-3" />
          <span>{kind.label}</span>
        </div>
        {isLowConfidence && (
          <div className="flex items-center gap-1 text-[11px] text-lumi-muted">
            <AlertCircle className="w-3 h-3" />
            <span>{Math.round(event.confidence * 100)}% — verify</span>
          </div>
        )}
      </div>

      <div className="px-5 pt-2 pb-5">
        {/* Title */}
        <Link
          href={`/events/${event.id}`}
          className="group/title inline-block"
        >
          <h2 className="font-serif text-2xl leading-tight text-lumi-text group-hover/title:text-lumi-accent transition-colors">
            {event.title}
          </h2>
        </Link>

        {/* Meta lines */}
        <div className="mt-3 space-y-1.5 text-sm text-lumi-muted">
          <MetaRow icon={<Calendar className="w-4 h-4" />}>
            {formatWhen(event.startTime, event.endTime)}
          </MetaRow>
          {event.locationName && (
            <MetaRow icon={<MapPin className="w-4 h-4" />}>
              <span className="text-lumi-text">{event.locationName}</span>
              {event.locationAddress && (
                <span className="text-lumi-subtle"> · {event.locationAddress}</span>
              )}
            </MetaRow>
          )}
          {event.organizerCompany && (
            <MetaRow icon={<Building2 className="w-4 h-4" />}>
              Hosted by{" "}
              <span className="text-lumi-text">{event.organizerCompany}</span>
              {event.organizerName && (
                <span className="text-lumi-subtle"> via {event.organizerName}</span>
              )}
            </MetaRow>
          )}
        </div>

        {/* Description */}
        <p className="mt-4 text-sm leading-relaxed text-lumi-muted line-clamp-2">
          {event.description}
        </p>

        {/* Source row */}
        {email && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="mt-3 flex items-center gap-1.5 text-xs text-lumi-subtle hover:text-lumi-muted transition-colors"
          >
            <Mail className="w-3 h-3" />
            <span>
              From <span className="text-lumi-muted">{email.fromName}</span> ·{" "}
              {detectionLabels[event.detectedVia]}
            </span>
            <ChevronRight
              className={`w-3 h-3 transition-transform ${expanded ? "rotate-90" : ""}`}
            />
          </button>
        )}

        {expanded && email && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 overflow-hidden"
          >
            <div className="rounded-lg border border-lumi-border bg-lumi-bg p-3">
              <div className="flex items-center gap-2 text-xs text-lumi-subtle mb-2">
                <FileText className="w-3 h-3" />
                <span className="font-mono truncate">{email.subject}</span>
              </div>
              <p className="text-xs leading-relaxed text-lumi-muted whitespace-pre-wrap max-h-40 overflow-y-auto">
                {email.bodyText}
              </p>
            </div>
          </motion.div>
        )}

        {/* Actions */}
        <div className="mt-5 flex items-center gap-2">
          <button
            onClick={() => onAction(event.id, "DECLINED")}
            className="flex items-center gap-1.5 rounded-lg border border-lumi-border px-3 py-2 text-xs font-medium text-lumi-muted hover:text-lumi-text hover:border-lumi-subtle transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            Decline
          </button>
          <button
            onClick={() => onAction(event.id, "MAYBE")}
            className="flex items-center gap-1.5 rounded-lg border border-lumi-border px-3 py-2 text-xs font-medium text-lumi-muted hover:text-lumi-text hover:border-lumi-subtle transition-colors"
          >
            <CircleHelp className="w-3.5 h-3.5" />
            Maybe
          </button>
          <div className="flex-1" />
          <button
            onClick={() => onAction(event.id, "ACCEPTED")}
            className="flex items-center gap-1.5 rounded-lg bg-lumi-accent px-4 py-2 text-xs font-semibold text-lumi-bg hover:bg-lumi-accent-hover transition-colors"
          >
            <Check className="w-3.5 h-3.5" />
            Attend
          </button>
        </div>
      </div>
    </motion.article>
  );
}

function MetaRow({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-lumi-subtle mt-0.5">{icon}</span>
      <span className="flex-1">{children}</span>
    </div>
  );
}
