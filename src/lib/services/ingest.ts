import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { listMessages, fetchMessage } from "@/lib/services/gmail";
import { processEmail, persistEvents, type PipelineResult } from "@/lib/services/detect";
import { fetchHandshakeEvents, HandshakeFeedError } from "@/lib/services/handshake";
import { contentHash } from "@/lib/detection/prefilter";
import { recordMetrics, type Counters } from "@/lib/metrics";

/** Detection attempts per email before it is given up on. */
export const MAX_ATTEMPTS = 3;

export type IngestResult = {
  /** Message ids Gmail listed for the query. */
  fetched: number;
  /** Of those, how many were new to Lumi. */
  newEmails: number;
  /** New emails that did not reach the model (keyword gate or pre-filter). */
  skipped: number;
  /** Extraction calls made. */
  sentToModel: number;
  eventsCreated: number;
  /** Emails whose detection threw; they are retried on a later sweep. */
  failed: number;
};

function tally(counters: Partial<Counters>, result: PipelineResult): void {
  counters.eventsFound = (counters.eventsFound ?? 0) + result.found;
  counters.eventsCreated = (counters.eventsCreated ?? 0) + result.created;
  if (result.skip) counters.emailsSkipped = (counters.emailsSkipped ?? 0) + 1;
  if (result.llm.called) {
    counters.emailsToModel = (counters.emailsToModel ?? 0) + 1;
    counters.llmInputTokens = (counters.llmInputTokens ?? 0) + result.llm.inputTokens;
    counters.llmOutputTokens = (counters.llmOutputTokens ?? 0) + result.llm.outputTokens;
    counters.llmUsd = (counters.llmUsd ?? 0) + result.llm.usd;
  }
}

/**
 * Ingest recent mail for a user.
 * Per message: skip what is already stored, fetch, store, run detection.
 * Returns counts so the UI and the sweep log can surface progress.
 */
export async function ingestUser(
  userId: string,
  opts: { query?: string; maxResults?: number } = {}
): Promise<IngestResult> {
  const ids = await listMessages(userId, opts);
  const result: IngestResult = {
    fetched: ids.length,
    newEmails: 0,
    skipped: 0,
    sentToModel: 0,
    eventsCreated: 0,
    failed: 0,
  };
  const counters: Partial<Counters> = {};

  // Sweeps overlap by an hour on purpose, so most listed ids are ones we
  // already hold. Drop them before paying for the raw download.
  const known = ids.length
    ? await prisma.email.findMany({
        where: { userId, gmailId: { in: ids } },
        select: { gmailId: true },
      })
    : [];
  const knownIds = new Set(known.map((k) => k.gmailId));

  for (const gmailId of ids) {
    if (knownIds.has(gmailId)) continue;

    // One bad message must not kill the rest of the batch — that includes a
    // fetch that still fails after its retries.
    let parsed;
    try {
      parsed = await fetchMessage(userId, gmailId);
    } catch (err) {
      console.error(`[ingest] fetch failed for ${gmailId}:`, err instanceof Error ? err.message : err);
      result.failed++;
      continue;
    }
    if (!parsed) continue;

    let email;
    try {
      email = await prisma.email.create({
        data: {
          userId,
          messageId: parsed.messageId,
          gmailId,
          threadId: parsed.threadId || null,
          from: parsed.from,
          subject: parsed.subject,
          bodyText: parsed.bodyText,
          bodyHtml: parsed.bodyHtml,
          receivedAt: parsed.receivedAt,
          hasIcs: parsed.hasIcs,
          processed: false,
          contentHash: contentHash(parsed.from, parsed.subject, parsed.bodyText),
        },
      });
    } catch (err) {
      // Already stored: a row from before gmailId existed, or a concurrent
      // sweep that got here first. Either way it is not new.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
      throw err;
    }
    result.newEmails++;
    counters.emailsScanned = (counters.emailsScanned ?? 0) + 1;

    const outcome = await detect(userId, email.id, gmailId, {
      bodyText: parsed.bodyText,
      bodyHtml: parsed.bodyHtml,
      icsContent: parsed.icsContent,
      subject: parsed.subject,
      from: parsed.from,
      receivedAt: parsed.receivedAt,
      threadId: parsed.threadId || null,
      listUnsubscribe: parsed.listUnsubscribe,
    });
    if (!outcome) {
      result.failed++;
      continue;
    }
    tally(counters, outcome);
    result.eventsCreated += outcome.created;
    if (outcome.skip) result.skipped++;
    if (outcome.llm.called) result.sentToModel++;
  }

  await recordMetrics(userId, counters);
  return result;
}

/** Run detection for one stored email and record the outcome on its row. */
async function detect(
  userId: string,
  emailId: string,
  label: string,
  msg: Parameters<typeof processEmail>[2]
): Promise<PipelineResult | null> {
  try {
    const outcome = await processEmail(userId, emailId, msg);
    await prisma.email.update({
      where: { id: emailId },
      data: { processed: true, attempts: { increment: 1 }, skipReason: outcome.skip },
    });
    return outcome;
  } catch (err) {
    console.error(`[ingest] detection failed for ${label}:`, err instanceof Error ? err.message : err);
    await prisma.email
      .update({ where: { id: emailId }, data: { attempts: { increment: 1 } } })
      .catch(() => {});
    return null;
  }
}

/**
 * Second chance for emails whose detection threw (model outage, rate limit
 * that outlasted the retries, a database blip). Before this existed such an
 * email stayed `processed: false` forever: the next sweep saw it as already
 * ingested and never looked at it again.
 *
 * Works from the stored body, so it needs no Gmail call. An ICS attachment is
 * not stored and therefore not re-tried; that tier does not call out, so the
 * failure will not have been there.
 */
export async function retryUnprocessed(
  userId: string,
  limit = 25
): Promise<{ retried: number; recovered: number; eventsCreated: number }> {
  const pending = await prisma.email.findMany({
    // The age floor keeps this from racing an ingest that is still working
    // through the same rows; it also picks up emails orphaned by a crash.
    where: {
      userId,
      processed: false,
      attempts: { lt: MAX_ATTEMPTS },
      createdAt: { lt: new Date(Date.now() - 5 * 60 * 1000) },
    },
    orderBy: { receivedAt: "asc" },
    take: limit,
  });
  const counters: Partial<Counters> = {};
  let recovered = 0;
  let eventsCreated = 0;

  for (const email of pending) {
    const outcome = await detect(userId, email.id, email.id, {
      bodyText: email.bodyText ?? "",
      bodyHtml: email.bodyHtml ?? "",
      subject: email.subject,
      from: email.from,
      receivedAt: email.receivedAt,
      threadId: email.threadId,
    });
    if (!outcome) continue;
    recovered++;
    eventsCreated += outcome.created;
    tally(counters, outcome);
  }

  await recordMetrics(userId, counters);
  return { retried: pending.length, recovered, eventsCreated };
}

/**
 * Resolve the Handshake feed for a user: their stored URL, else the
 * HANDSHAKE_ICS_URL env fallback (single-user deploys like lumi-live).
 */
async function handshakeFeedFor(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { handshakeFeedUrl: true },
  });
  return user?.handshakeFeedUrl || process.env.HANDSHAKE_ICS_URL?.trim() || null;
}

/**
 * Ingest the user's Handshake calendar feed.
 * No-op (not an error) when no feed is configured, so it can be called
 * unconditionally from every sweep.
 */
export async function ingestHandshake(
  userId: string
): Promise<{ configured: boolean; fetched: number; eventsCreated: number }> {
  const feedUrl = await handshakeFeedFor(userId);
  if (!feedUrl) return { configured: false, fetched: 0, eventsCreated: 0 };

  let events;
  try {
    events = await fetchHandshakeEvents(feedUrl);
  } catch (err) {
    // A bad or rotated feed must not take the Gmail sweep down with it.
    if (err instanceof HandshakeFeedError) {
      console.error(`[handshake] ${err.message}`);
    } else {
      console.error("[handshake] feed fetch failed:", err);
    }
    return { configured: true, fetched: 0, eventsCreated: 0 };
  }

  const eventsCreated = await persistEvents(
    userId,
    null,
    events,
    "ICS",
    "HANDSHAKE"
  );
  // eventsFound is not counted here: the feed returns the same events every
  // sweep, so only genuinely new cards are a meaningful number.
  await recordMetrics(userId, { eventsCreated });
  return { configured: true, fetched: events.length, eventsCreated };
}
