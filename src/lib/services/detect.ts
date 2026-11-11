import { createHash } from "crypto";
import { DEFAULT_TIMEZONE, addCalendarDays, localDate, parseInTimeZone, startOfLocalDate, validTimeZone } from "@/lib/zonedTime";
import { prisma } from "@/lib/db";
import { listCalendarWindow, findConflict } from "@/lib/services/calendar";
import { parseIcs } from "@/lib/detection/ics";
import { parseSchemaOrg } from "@/lib/detection/schema";
import { classifyKeyword } from "@/lib/detection/keyword";
import {
  alreadyHandled,
  contentHash,
  isBulk,
  isReplySubject,
  prefilter,
  senderAddress,
  shouldMuteSender,
  stripQuotedReply,
  type SkipReason,
} from "@/lib/detection/prefilter";
import { extractEventsDetailed, activeModel, activePromptVersion, clampRelevance, cleanReason } from "@/lib/services/extract";
import { normalizeProfile } from "@/lib/profile";
import type { ExtractedEvent } from "@/lib/detection/types";
import { summaryFor } from "@/lib/brief";
import { noteSpend, withinDailyBudget } from "@/lib/limits";

export type PipelineMessage = {
  bodyText: string;
  bodyHtml: string;
  icsContent?: string;
  subject: string;
  from: string;
  receivedAt: Date;
  threadId?: string | null;
  /** True when the message carried a List-Unsubscribe header. */
  listUnsubscribe?: boolean;
};

/** What happened to one email — the unit the funnel metrics are built from. */
export type PipelineResult = {
  /** Event cards created. */
  created: number;
  /** Events a tier extracted, before dedup and the past-event filter. */
  found: number;
  /** Which tier produced them; null when the email was skipped. */
  tier: "ICS" | "SCHEMA_ORG" | "LLM" | null;
  /**
   * Why the model was not called, when it was not. "budget" is the one reason
   * that is about the user rather than the email: their model spend for the
   * day reached LUMI_USER_DAILY_USD (src/lib/limits.ts).
   */
  skip: "keyword" | "budget" | SkipReason | null;
  /** Whether a model call was made, and what it cost. */
  llm: { called: boolean; inputTokens: number; outputTokens: number; usd: number };
};

const NO_LLM = { called: false, inputTokens: 0, outputTokens: 0, usd: 0 };

function skipped(skip: PipelineResult["skip"]): PipelineResult {
  return { created: 0, found: 0, tier: null, skip, llm: NO_LLM };
}

/** PREFILTER_SENDER_HISTORY=false turns the learned sender mute off. */
function senderHistoryEnabled(): boolean {
  return process.env.PREFILTER_SENDER_HISTORY !== "false";
}

/**
 * Tiered pipeline: try the cheapest/strongest signal first, fall through
 * to the next tier only when the current one finds nothing.
 *
 *   1. ICS attachment       → parse directly (confidence 1.0)
 *   2. schema.org JSON-LD   → parse HTML (confidence 0.95)
 *   3. keyword gate + rule-based pre-filter → decide whether to spend LLM tokens
 *   4. LLM tool_use         → extract structured JSON (confidence <= 1.0)
 */
export async function processEmail(
  userId: string,
  emailId: string,
  msg: PipelineMessage
): Promise<PipelineResult> {
  // Tier 0 — things the user already handled: Google Calendar's own
  // invitation and cancellation mail, reservation confirmations. These carry
  // ICS and structured markup, so the check has to come before tier 1.
  const handled = alreadyHandled(msg);
  if (handled) return skipped(handled);

  // Tier 1 — ICS
  if (msg.icsContent) {
    const events = parseIcs(msg.icsContent);
    if (events.length > 0) {
      const created = await persistEvents(userId, emailId, events, "ICS");
      return { created, found: events.length, tier: "ICS", skip: null, llm: NO_LLM };
    }
  }

  // Tier 2 — schema.org JSON-LD
  if (msg.bodyHtml) {
    const events = parseSchemaOrg(msg.bodyHtml);
    if (events.length > 0) {
      const created = await persistEvents(userId, emailId, events, "SCHEMA_ORG");
      return { created, found: events.length, tier: "SCHEMA_ORG", skip: null, llm: NO_LLM };
    }
  }

  // Tier 3 — keyword gate, then the free rules. Everything from here down
  // exists to avoid a model call that would come back empty.
  if (!classifyKeyword(msg.subject, msg.bodyText).hit) return skipped("keyword");

  const verdict = prefilter(msg);
  if (!verdict.pass) return skipped(verdict.reason);

  // A reply quotes the message it answers. If that earlier message is already
  // in this user's thread, only the newly written text can add an event.
  if (msg.threadId && isReplySubject(msg.subject)) {
    const earlier = await prisma.email.count({
      where: { userId, threadId: msg.threadId, id: { not: emailId }, receivedAt: { lt: msg.receivedAt } },
    });
    if (earlier > 0 && !classifyKeyword("", stripQuotedReply(msg.bodyText)).hit) {
      return skipped("unchanged_thread");
    }
  }

  // The same announcement delivered twice (two lists, a resend) is one email.
  const hash = contentHash(msg.from, msg.subject, msg.bodyText);
  const twin = await prisma.email.findFirst({
    where: { userId, contentHash: hash, processed: true, id: { not: emailId } },
    select: { id: true },
  });
  if (twin) return skipped("duplicate");

  const sender = senderAddress(msg.from);
  const bulk = isBulk(msg.bodyText, msg.listUnsubscribe);
  const history = senderHistoryEnabled()
    ? await prisma.senderStat.findUnique({ where: { userId_sender: { userId, sender } } })
    : null;
  if (bulk && shouldMuteSender(history)) {
    await prisma.senderStat.update({
      where: { userId_sender: { userId, sender } },
      data: { skippedSinceProbe: { increment: 1 } },
    });
    return skipped("sender_history");
  }

  // The last free check: one user's inbox must not be able to run up the
  // bill. Everything above this line costs nothing, so it still ran.
  if (!(await withinDailyBudget(userId))) return skipped("budget");

  // Tier 4 — LLM extraction, scored against this user's own interests.
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { profile: true },
  });
  const extraction = await extractEventsDetailed({
    subject: msg.subject,
    from: msg.from,
    bodyText: msg.bodyText,
    receivedAt: msg.receivedAt,
    profile: normalizeProfile(row?.profile),
  });
  const { events } = extraction;
  const llm = {
    called: extraction.called,
    inputTokens: extraction.usage.inputTokens,
    outputTokens: extraction.usage.outputTokens,
    usd: extraction.usd ?? 0,
  };
  noteSpend(userId, llm.usd);

  if (extraction.called && senderHistoryEnabled()) {
    await prisma.senderStat.upsert({
      where: { userId_sender: { userId, sender } },
      create: { userId, sender, llmCalls: 1, eventsFound: events.length },
      update: {
        llmCalls: { increment: 1 },
        eventsFound: { increment: events.length },
        skippedSinceProbe: 0,
      },
    });
  }

  if (events.length === 0) return { created: 0, found: 0, tier: "LLM", skip: null, llm };

  const created = await persistEvents(userId, emailId, events, "LLM", "EMAIL", {
    extractedBy: activeModel(),
    promptVersion: activePromptVersion(),
  });
  return { created, found: events.length, tier: "LLM", skip: null, llm };
}

/** The user's zone, for times that arrive with no offset and no zone of their own. */
async function userTimeZone(userId: string): Promise<string> {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
    return validTimeZone(user?.timezone);
  } catch {
    return DEFAULT_TIMEZONE;
  }
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
  const userZone = events.length ? await userTimeZone(userId) : DEFAULT_TIMEZONE;
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

    // Times without an offset are read in the event's zone, else the user's;
    // the server's own zone (UTC) never decides what "6 PM" means.
    const zone = validTimeZone(e.timezone || userZone);
    const parsedStart = parseInTimeZone(e.startTime, zone);
    if (!parsedStart) continue;
    const start = parsedStart.at;
    const allDay = e.isAllDay === true || parsedStart.dateOnly;
    const day = localDate(start, zone);
    // An end that does not parse, or that precedes the start, is dropped
    // rather than allowed to fail the insert and take the email with it.
    const parsedEnd = parseInTimeZone(e.endTime, zone)?.at ?? null;
    const end =
      parsedEnd && parsedEnd.getTime() > start.getTime()
        ? parsedEnd
        : allDay
          ? startOfLocalDate(addCalendarDays(day, 1), zone)
          : null;
    // Only future events are actionable. A timed event must not have started;
    // an all-day event stays until its day is over where it happens.
    const stillAhead = allDay ? end!.getTime() > Date.now() : start.getTime() > Date.now();
    if (!stillAhead) continue;
    // Survey/feedback deadlines are noise even when a tier extracts them.
    if (/survey|feedback/i.test(e.title)) continue;

    const dedup = dedupHash(e.title, start, e.organizerCompany ?? e.organizerName);
    // Skip if we've seen this event (same title+date+organizer) for this user.
    const existing = await prisma.event.findFirst({
      where: { userId, dedupHash: dedup },
      select: { id: true },
    });
    if (existing) continue;

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
    const eventEnd = end ?? new Date(start.getTime() + 60 * 60 * 1000);
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
        date: day,
        startTime: start,
        endTime: end,
        timezone: zone,
        isAllDay: allDay,
        locationName: e.locationName ?? null,
        locationAddress: e.locationAddress ?? null,
        organizerName: e.organizerName ?? null,
        organizerCompany: e.organizerCompany ?? null,
        rsvpLink: e.rsvpLink ?? null,
        rsvpDeadline: parseInTimeZone(e.rsvpDeadline, zone)?.at ?? null,
        attire: e.attire ?? null,
        relevance: clampRelevance(e.relevance),
        relevanceReason: cleanReason(e.relevanceReason) ?? null,
        // The model's sentence when it wrote one; a template for parser and
        // feed tiers so the card never shows an empty line.
        summary: e.summary ?? summaryFor({ ...e, startTime: start.toISOString() }),
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

export function dedupHash(title: string, start: Date, organizer?: string | null): string {
  const parts = [
    title.toLowerCase().trim(),
    start.toISOString().slice(0, 10),
    (organizer ?? "").toLowerCase().trim(),
  ].join("|");
  return createHash("sha256").update(parts).digest("hex").slice(0, 16);
}
