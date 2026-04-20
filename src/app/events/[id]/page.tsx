"use client";

import Link from "next/link";
import { notFound, useRouter } from "next/navigation";
import { use, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  ArrowLeft,
  Calendar,
  Check,
  CircleHelp,
  Clock,
  MapPin,
  Building2,
  Mail,
  ExternalLink,
  AlertTriangle,
  X,
  Sparkles,
  Download,
  Loader2,
} from "lucide-react";
import { Nav } from "@/components/Nav";
import type { EventStatus, MockEvent, MockEmail } from "@/lib/mock/events";

async function fetchEvent(id: string): Promise<MockEvent> {
  const res = await fetch(`/api/events/${id}`);
  if (res.status === 404) throw new Error("not-found");
  if (!res.ok) throw new Error("fetch failed");
  return (await res.json()).event as MockEvent;
}

async function fetchAllEvents(): Promise<MockEvent[]> {
  const res = await fetch("/api/events?limit=200");
  if (!res.ok) return [];
  return ((await res.json()).events as MockEvent[]) ?? [];
}

async function fetchEmail(id: string): Promise<MockEmail | null> {
  if (!id) return null;
  const res = await fetch(`/api/emails/${id}`);
  if (!res.ok) return null;
  return (await res.json()).email as MockEmail;
}

async function patchStatus(id: string, status: EventStatus): Promise<void> {
  const res = await fetch(`/api/events/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error("patch failed");
}

export default function EventDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const { data: event, isLoading, error } = useQuery({
    queryKey: ["event", id],
    queryFn: () => fetchEvent(id),
    retry: false,
  });
  const { data: allEvents = [] } = useQuery({
    queryKey: ["events"],
    queryFn: fetchAllEvents,
  });
  const { data: email } = useQuery({
    queryKey: ["email", event?.sourceEmailId],
    queryFn: () => fetchEmail(event?.sourceEmailId ?? ""),
    enabled: !!event?.sourceEmailId,
  });

  const [edits, setEdits] = useState({ title: "", locationName: "", locationAddress: "" });

  const mutation = useMutation({
    mutationFn: ({ status }: { status: EventStatus }) => patchStatus(id, status),
    onSuccess: () => setTimeout(() => router.push("/dashboard"), 400),
  });

  const conflicts = useMemo(() => {
    if (!event) return [];
    const start = new Date(event.startTime).getTime();
    const end = event.endTime ? new Date(event.endTime).getTime() : start + 60 * 60 * 1000;
    return allEvents.filter((e) => {
      if (e.id === event.id || e.status !== "ACCEPTED") return false;
      const s = new Date(e.startTime).getTime();
      const en = e.endTime ? new Date(e.endTime).getTime() : s + 60 * 60 * 1000;
      return s < end && en > start;
    });
  }, [event, allEvents]);

  if (error?.message === "not-found") notFound();
  if (isLoading || !event) {
    return (
      <div className="min-h-screen flex flex-col">
        <Nav />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-5 h-5 text-lumi-muted animate-spin" />
        </div>
      </div>
    );
  }

  // Lazy-initialize edits from loaded event (only once).
  if (edits.title === "" && event.title) {
    setEdits({
      title: event.title,
      locationName: event.locationName ?? "",
      locationAddress: event.locationAddress ?? "",
    });
  }

  const start = new Date(event.startTime);
  const end = event.endTime ? new Date(event.endTime) : null;
  const status = mutation.variables?.status ?? event.status;

  function handleAction(next: EventStatus) {
    mutation.mutate({ status: next });
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Nav />

      <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-8">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-lumi-muted hover:text-lumi-text mb-6 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to inbox
        </Link>

        {/* Header */}
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-lumi-accent mb-3">
          <Sparkles className="w-3.5 h-3.5" />
          {event.kind.replace("_", " ")}
          <span className="text-lumi-subtle">·</span>
          <span className="text-lumi-muted">
            {Math.round(event.confidence * 100)}% confidence · {event.detectedVia}
          </span>
        </div>

        <input
          value={edits.title}
          onChange={(e) => setEdits({ ...edits, title: e.target.value })}
          className="w-full bg-transparent font-serif text-4xl text-lumi-text leading-tight focus:outline-none focus:ring-0 border-b border-transparent focus:border-lumi-border pb-1"
        />

        {/* Conflict banner */}
        {conflicts.length > 0 && (
          <div className="mt-6 flex items-start gap-3 rounded-lg border border-lumi-rose/40 bg-lumi-rose/10 p-4">
            <AlertTriangle className="w-4 h-4 text-lumi-rose shrink-0 mt-0.5" />
            <div className="text-sm">
              <div className="text-lumi-text font-medium mb-1">
                Conflicts with {conflicts.length} other accepted event
                {conflicts.length > 1 ? "s" : ""}
              </div>
              <ul className="text-lumi-muted text-xs space-y-0.5">
                {conflicts.map((c) => (
                  <li key={c.id}>· {c.title}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Two-column: details + email preview */}
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8">
          {/* Details */}
          <section className="space-y-5">
            <DetailField
              icon={<Calendar className="w-4 h-4" />}
              label="Date"
              value={start.toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            />
            <DetailField
              icon={<Clock className="w-4 h-4" />}
              label="Time"
              value={
                end
                  ? `${start.toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                    })} – ${end.toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                    })}`
                  : start.toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                    })
              }
              sub={event.timezone}
            />
            <EditableField
              icon={<MapPin className="w-4 h-4" />}
              label="Location"
              value={edits.locationName}
              sub={edits.locationAddress}
              onChange={(v) => setEdits({ ...edits, locationName: v })}
              onSubChange={(v) => setEdits({ ...edits, locationAddress: v })}
            />
            {event.organizerCompany && (
              <DetailField
                icon={<Building2 className="w-4 h-4" />}
                label="Host"
                value={event.organizerCompany}
                sub={event.organizerName ? `via ${event.organizerName}` : undefined}
              />
            )}
            {event.rsvpLink && (
              <DetailField
                icon={<ExternalLink className="w-4 h-4" />}
                label="RSVP"
                value={event.rsvpLink}
                link={event.rsvpLink}
              />
            )}

            <div className="pt-4 border-t border-lumi-border">
              <div className="text-xs uppercase tracking-wider text-lumi-subtle mb-2">
                Description
              </div>
              <p className="text-sm text-lumi-muted leading-relaxed">
                {event.description}
              </p>
            </div>
          </section>

          {/* Source email preview */}
          {email && (
            <aside className="rounded-xl border border-lumi-border bg-lumi-surface p-5 h-fit lg:sticky lg:top-20">
              <div className="flex items-center gap-2 text-xs text-lumi-accent mb-3">
                <Mail className="w-3.5 h-3.5" />
                <span className="font-medium uppercase tracking-wider">Source</span>
              </div>
              <div className="text-sm text-lumi-text mb-1">{email.fromName}</div>
              <div className="text-xs text-lumi-subtle mb-3 truncate">{email.from}</div>
              <div className="text-sm font-medium text-lumi-text mb-3 leading-snug">
                {email.subject}
              </div>
              <p className="text-xs text-lumi-muted whitespace-pre-wrap max-h-72 overflow-y-auto leading-relaxed">
                {email.bodyText}
              </p>
              {email.extractedEventIds.length > 1 && (
                <div className="mt-3 pt-3 border-t border-lumi-border">
                  <div className="text-[10px] uppercase tracking-wider text-lumi-subtle mb-1.5">
                    Also from this email
                  </div>
                  {email.extractedEventIds
                    .filter((eid: string) => eid !== event.id)
                    .map((eid: string) => {
                      const other = allEvents.find((e) => e.id === eid);
                      if (!other) return null;
                      return (
                        <Link
                          key={eid}
                          href={`/events/${eid}`}
                          className="block text-xs text-lumi-muted hover:text-lumi-accent transition-colors py-0.5"
                        >
                          → {other.title}
                        </Link>
                      );
                    })}
                </div>
              )}
            </aside>
          )}
        </div>

        {/* Action bar */}
        <div className="sticky bottom-0 mt-12 -mx-6 px-6 py-4 border-t border-lumi-border bg-lumi-bg/90 backdrop-blur-lg">
          <div className="flex items-center justify-between">
            <div className="text-xs text-lumi-muted">
              {status === "PENDING" ? (
                "Decide once — Lumi will sync to your calendar."
              ) : (
                <span className="text-lumi-accent">
                  Marked as {status.toLowerCase()} · redirecting…
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <a
                href={`/api/events/${event.id}/ics`}
                className="flex items-center gap-1.5 rounded-lg border border-lumi-border px-3 py-2 text-xs font-medium text-lumi-muted hover:text-lumi-text transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                .ics
              </a>
              <button
                onClick={() => handleAction("DECLINED")}
                className="flex items-center gap-1.5 rounded-lg border border-lumi-border px-3 py-2 text-xs font-medium text-lumi-muted hover:text-lumi-text transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Decline
              </button>
              <button
                onClick={() => handleAction("MAYBE")}
                className="flex items-center gap-1.5 rounded-lg border border-lumi-border px-3 py-2 text-xs font-medium text-lumi-muted hover:text-lumi-text transition-colors"
              >
                <CircleHelp className="w-3.5 h-3.5" />
                Maybe
              </button>
              <button
                onClick={() => handleAction("ACCEPTED")}
                className="flex items-center gap-1.5 rounded-lg bg-lumi-accent px-4 py-2 text-xs font-semibold text-lumi-bg hover:bg-lumi-accent-hover transition-colors"
              >
                <Check className="w-3.5 h-3.5" />
                Attend & add to calendar
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function DetailField({
  icon,
  label,
  value,
  sub,
  link,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  link?: string;
}) {
  const body = (
    <div className="text-sm text-lumi-text">
      {value}
      {sub && <div className="text-xs text-lumi-muted mt-0.5">{sub}</div>}
    </div>
  );
  return (
    <div className="flex items-start gap-3">
      <div className="text-lumi-subtle mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-lumi-subtle mb-1">
          {label}
        </div>
        {link ? (
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-lumi-accent hover:underline truncate block"
          >
            {value}
          </a>
        ) : (
          body
        )}
      </div>
    </div>
  );
}

function EditableField({
  icon,
  label,
  value,
  sub,
  onChange,
  onSubChange,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  onChange: (v: string) => void;
  onSubChange: (v: string) => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="text-lumi-subtle mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-lumi-subtle mb-1">
          {label}
        </div>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent text-sm text-lumi-text focus:outline-none border-b border-transparent focus:border-lumi-border"
        />
        <input
          value={sub}
          onChange={(e) => onSubChange(e.target.value)}
          placeholder="Address"
          className="w-full bg-transparent text-xs text-lumi-muted focus:outline-none border-b border-transparent focus:border-lumi-border mt-1"
        />
      </div>
    </div>
  );
}
