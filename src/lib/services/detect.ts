import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import { parseIcs } from "@/lib/detection/ics";
import { parseSchemaOrg } from "@/lib/detection/schema";
import { classifyKeyword } from "@/lib/detection/keyword";
import { extractWithClaude } from "@/lib/services/extract";
import type { ExtractedEvent } from "@/lib/detection/types";

/**
 * Tiered pipeline: try the cheapest/strongest signal first, fall through
 * to the next tier only when the current one finds nothing.
 *
 *   1. ICS attachment       → parse directly (confidence 1.0)
 *   2. schema.org JSON-LD   → parse HTML (confidence 0.95)
 *   3. keyword classifier   → gate whether to spend LLM tokens
 *   4. Claude tool_use      → extract structured JSON (confidence <= 1.0)
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

  // Tier 4 — Claude extraction
  const events = await extractWithClaude({
    subject: msg.subject,
    from: msg.from,
    bodyText: msg.bodyText,
    receivedAt: msg.receivedAt,
  });
  if (events.length === 0) return 0;

  return persistEvents(userId, emailId, events, "LLM");
}

async function persistEvents(
  userId: string,
  emailId: string,
  events: ExtractedEvent[],
  via: "ICS" | "SCHEMA_ORG" | "KEYWORD" | "LLM"
): Promise<number> {
  let inserted = 0;
  for (const e of events) {
    const dedup = dedupHash(e);
    // Skip if we've seen this event (same title+date+organizer) for this user.
    const existing = await prisma.event.findFirst({
      where: { userId, dedupHash: dedup },
    });
    if (existing) continue;

    const start = new Date(e.startTime);
    await prisma.event.create({
      data: {
        userId,
        emailId,
        status: "PENDING",
        confidence: e.confidence,
        detectedVia: via,
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
        dedupHash: dedup,
      },
    });
    inserted++;
  }
  return inserted;
}

function dedupHash(e: ExtractedEvent): string {
  const parts = [
    e.title.toLowerCase().trim(),
    new Date(e.startTime).toISOString().slice(0, 10),
    (e.organizerCompany ?? e.organizerName ?? "").toLowerCase().trim(),
  ].join("|");
  return createHash("sha256").update(parts).digest("hex").slice(0, 16);
}
