import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import { listCalendarWindow, findConflict } from "@/lib/services/calendar";
import { parseIcs } from "@/lib/detection/ics";
import { parseSchemaOrg } from "@/lib/detection/schema";
import { classifyKeyword } from "@/lib/detection/keyword";
import { extractEvents, activeModel } from "@/lib/services/extract";
import { normalizeProfile, PROMPT_VERSION } from "@/lib/profile";
import type { ExtractedEvent } from "@/lib/detection/types";

/**
 * Tiered pipeline: try the cheapest/strongest signal first, fall through
 * to the next tier only when the current one finds nothing.
 *
 *   1. ICS attachment       → parse directly (confidence 1.0)
 *   2. schema.org JSON-LD   → parse HTML (confidence 0.95)
 *   3. keyword classifier   → gate whether to spend LLM tokens
 *   4. LLM tool_use         → extract structured JSON (confidence <= 1.0)
 *
 * Returns the number of events persisted.
 */
export async function processEmail(
  userId: string,
  emailId: string,
  msg: {
    bodyText: string;
    bodyHtml: string;
    icsContent?: string;
    subject: string;
    from: string;
    receivedAt: Date;
  }
): Promise<number> {
  // Tier 1 — ICS
  if (msg.icsContent) {
    const events = parseIcs(msg.icsContent);
    if (events.length > 0) {
      return persistEvents(userId, emailId, events, "ICS");
    }
  }

  // Tier 2 — schema.org JSON-LD
  if (msg.bodyHtml) {
    const events = parseSchemaOrg(msg.bodyHtml);
    if (events.length > 0) {
      return persistEvents(userId, emailId, events, "SCHEMA_ORG");
    }
  }

  // Tier 3 — keyword gate
  const verdict = classifyKeyword(msg.subject, msg.bodyText);
  if (!verdict.hit) return 0;

  // Tier 4 — LLM extraction, scored against this user's own interests.
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { profile: true },
  });
  const events = await extractEvents({
    subject: msg.subject,
    from: msg.from,
    bodyText: msg.bodyText,
    receivedAt: msg.receivedAt,
    profile: normalizeProfile(row?.profile),
  });
  if (events.length === 0) return 0;

  return persistEvents(userId, emailId, events, "LLM", "EMAIL", {
    extractedBy: activeModel(),
    promptVersion: PROMPT_VERSION,
  });
}

/**
 * Persist extracted events for a user, applying every guard the pipeline
 * relies on: upstream-id dedup, title+date+organizer dedup, cross-source fuzzy
 * dedup, past-event and survey filtering, and Google Calendar conflict
 * flagging. Shared by the email pipeline and the Handshake feed so both get
 * identical semantics.
 */
export async function persistEvents(
  userId: string,
  emailId: string | null,
  events: ExtractedEvent[],
  via: "ICS" | "SCHEMA_ORG" | "KEYWORD" | "LLM",
  source: "EMAIL" | "HANDSHAKE" = "EMAIL",
  /** Only the LLM tier has a model to attribute; the parser tiers pass nothing. */
  meta?: { extractedBy: string; promptVersion: string }
): Promise<number> {
  let inserted = 0;
  for (const e of events) {
    // Tier 0 — stable upstream id. A feed re-fetched every sweep hands back
    // the same UIDs, and those must never re-insert.
    if (e.sourceUid) {
      const seen = await prisma.event.findUnique({
        where: { userId_sourceUid: { userId, sourceUid: e.sourceUid } },
        select: { id: true },
      });
      if (seen) continue;
    }

    const dedup = dedupHash(e);
    // Skip if we've seen this event (same title+date+organizer) for this user.
    const existing = await prisma.event.findFirst({
      where: { userId, dedupHash: dedup },
    });
    if (existing) continue;

    const start = new Date(e.startTime);
    // Only future events are actionable — skip past or unparseable dates.
    if (!(start.getTime() > Date.now())) continue;
    // Survey/feedback deadlines are noise even when a tier extracts them.
    if (/survey|feedback/i.test(e.title)) continue;

    // Fuzzy cross-email dedup: the same event announced by two senders comes
    // in with slightly different titles/organizers and beats the exact hash.
    // Same user + start within an hour + high title overlap = same event.
    const near = await prisma.event.findMany({
      where: {
        userId,
        startTime: {
          gte: new Date(start.getTime() - 60 * 60 * 1000),
          lte: new Date(start.getTime() + 60 * 60 * 1000),
        },
      },
      select: { title: true },
    });
    if (near.some((n) => titleSimilarity(n.title, e.title) >= 0.6)) continue;

    // Calendar awareness: flag (never decide) when the event overlaps
    // something already on the user's Google Calendar.
    const eventEnd = e.endTime
      ? new Date(e.endTime)
      : new Date(start.getTime() + 60 * 60 * 1000);
    const busy = await listCalendarWindow(userId, start, eventEnd);
    const conflictTitle = busy ? findConflict(busy, start, eventEnd) : null;

    await prisma.event.create({
      data: {
        userId,
        emailId,
        status: "PENDING",
        confidence: e.confidence,
        detectedVia: via,
        source,
        sourceUid: e.sourceUid ?? null,
        extractedBy: meta?.extractedBy ?? null,
        promptVersion: meta?.promptVersion ?? null,
        title: e.title,
        description: e.description,
        date: start.toISOString().slice(0, 10),
        startTime: start,
        endTime: e.endTime ? new Date(e.endTime) : null,
        timezone: e.timezone,
        locationName: e.locationName ?? null,
        locationAddress: e.locationAddress ?? null,
        organizerName: e.organizerName ?? null,
        organizerCompany: e.organizerCompany ?? null,
        rsvpLink: e.rsvpLink ?? null,
        rsvpDeadline: e.rsvpDeadline ? new Date(e.rsvpDeadline) : null,
        attire: e.attire ?? null,
        relevance: Math.min(5, Math.max(1, Math.round(e.relevance ?? 3))),
        conflictTitle,
        dedupHash: dedup,
      },
    });
    inserted++;
  }
  return inserted;
}

function titleTokens(t: string): Set<string> {
  return new Set(
    t
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
}

/** Overlap coefficient of title word sets: 1.0 = one title's words all appear in the other. */
export function titleSimilarity(a: string, b: string): number {
  const ta = titleTokens(a);
  const tb = titleTokens(b);
  if (!ta.size || !tb.size) return 0;
  let overlap = 0;
  for (const w of ta) if (tb.has(w)) overlap++;
  return overlap / Math.min(ta.size, tb.size);
}

function dedupHash(e: ExtractedEvent): string {
  const parts = [
    e.title.toLowerCase().trim(),
    new Date(e.startTime).toISOString().slice(0, 10),
    (e.organizerCompany ?? e.organizerName ?? "").toLowerCase().trim(),
  ].join("|");
  return createHash("sha256").update(parts).digest("hex").slice(0, 16);
}
