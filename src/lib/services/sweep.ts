/**
 * The inbox sweep: ingest every connected user's new mail, refresh calendar
 * conflict badges, then purge anything outside the retention window.
 *
 * Two callers: the worker's wall-clock timer, and POST /api/cron/sweep for an
 * external scheduler. Two modes, chosen by INGEST_MODE:
 *
 *   inline (default)  the sweep does the ingest itself, in this process. No
 *                     Redis, no always-on consumer — the whole pipeline is one
 *                     function call, so a scheduled HTTP request can run it.
 *   queue             the sweep enqueues one BullMQ job per user and the
 *                     worker process consumes them. Needs Redis; worth it only
 *                     when one process can no longer get through every inbox.
 *
 * Inline is the default because the queue was the single largest line on the
 * hosting bill: an idle BullMQ consumer polls Redis around the clock, and a
 * pay-per-command Redis charges for every poll. See docs/COST.md.
 */
import { Sentry } from "@/lib/services/instrument";
import { MAIL_FILTER } from "@/lib/services/gmail";
import { ingestUser, ingestHandshake, retryUnprocessed, type IngestResult } from "@/lib/services/ingest";
import type { IngestJob } from "@/lib/queue";
import { listCalendarWindow, findConflict } from "@/lib/services/calendar";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

const WINDOW_DAYS = 14;
const WINDOW_MS = WINDOW_DAYS * 24 * 60 * 60 * 1000;

// Incremental query: only list mail newer than what we've already ingested
// (1h overlap; messageId dedup absorbs it). First run backfills the window.
async function queryFor(userId: string): Promise<string> {
  const latest = await prisma.email.findFirst({
    where: { userId },
    orderBy: { receivedAt: "desc" },
    select: { receivedAt: true },
  });
  if (!latest) return `newer_than:${WINDOW_DAYS}d ${MAIL_FILTER}`;
  const floor = Date.now() - WINDOW_MS;
  const after = Math.max(latest.receivedAt.getTime() - 60 * 60 * 1000, floor);
  return `after:${Math.floor(after / 1000)} ${MAIL_FILTER}`;
}

// Keep only the window: drop old emails, past events, and decided events
// once they age out. Decided events vanish from the UI immediately; this
// just stops the DB from growing.
async function purge() {
  const cutoff = new Date(Date.now() - WINDOW_MS);
  const events = await prisma.event.deleteMany({
    where: {
      OR: [
        { status: { in: ["ACCEPTED", "DECLINED"] }, updatedAt: { lt: cutoff } },
        { startTime: { lt: cutoff } },
        // An undecided event that has already started can no longer be attended.
        { status: { in: ["PENDING", "MAYBE"] }, startTime: { lt: new Date() } },
      ],
    },
  });
  const emails = await prisma.email.deleteMany({
    where: { receivedAt: { lt: cutoff } },
  });
  await prisma.llmUsage.deleteMany({ where: { createdAt: { lt: cutoff } } });
  if (events.count || emails.count)
    console.log(`[purge] removed ${events.count} event(s), ${emails.count} email(s) older than ${WINDOW_DAYS}d`);
}

// Re-check undecided upcoming events against the user's calendar so conflict
// badges track calendar changes. One events.list call per user per sweep.
async function refreshConflicts(userId: string) {
  const now = new Date();
  const pending = await prisma.event.findMany({
    where: { userId, status: { in: ["PENDING", "MAYBE"] }, startTime: { gt: now } },
    select: { id: true, startTime: true, endTime: true, conflictTitle: true },
  });
  if (!pending.length) return;
  const maxEnd = new Date(
    Math.max(...pending.map((p) => (p.endTime ?? new Date(p.startTime.getTime() + 3600_000)).getTime()))
  );
  const busy = await listCalendarWindow(userId, now, maxEnd);
  if (!busy) return;
  for (const p of pending) {
    const end = p.endTime ?? new Date(p.startTime.getTime() + 3600_000);
    const title = findConflict(busy, p.startTime, end);
    if (title !== p.conflictTitle) {
      await prisma.event.update({ where: { id: p.id }, data: { conflictTitle: title } });
    }
  }
}

export type IngestMode = "inline" | "queue";

export function ingestMode(): IngestMode {
  return process.env.INGEST_MODE?.trim().toLowerCase() === "queue" ? "queue" : "inline";
}

// One list page per sweep, and the incremental floor advances past whatever
// isn't fetched — so the cap has to cover a full half-day of mail.
const SWEEP_MAX_RESULTS = 250;

const NO_GMAIL: IngestResult = { fetched: 0, newEmails: 0, skipped: 0, sentToModel: 0, eventsCreated: 0, failed: 0 };

/**
 * Everything one user's sweep does, in order: Gmail, the Handshake feed, then
 * a second try at emails an earlier sweep failed on. Shared by the inline
 * sweep and the BullMQ consumer so the two modes cannot drift apart.
 *
 * A forwarding-only user (no Google account) gets `gmail: false`: their mail
 * arrives through POST /api/ingest/inbound as it is sent, so the Gmail step
 * is skipped outright, but the retry step still runs for them — a forwarded
 * email whose detection failed is recovered the same way.
 */
export async function runIngestJob(job: IngestJob) {
  const result =
    job.gmail === false
      ? NO_GMAIL
      : await ingestUser(job.userId, { query: job.query, maxResults: job.maxResults });
  // Handshake rides the same job; its own failures are swallowed inside
  // ingestHandshake so a rotated feed link cannot fail the Gmail half.
  const handshake = await ingestHandshake(job.userId);
  const retry = await retryUnprocessed(job.userId);
  return { ...result, handshake, retry };
}

/**
 * Who the sweep serves: anyone with a Google account (Gmail is polled) or a
 * forwarding address (mail is pushed; only the retry and Handshake steps
 * apply). A user with neither has no mail source and is left alone.
 */
async function sweepUsers(): Promise<{ id: string; gmail: boolean }[]> {
  const users = await prisma.user.findMany({
    where: {
      OR: [{ accounts: { some: { provider: "google" } } }, { forwardingToken: { not: null } }],
    },
    select: { id: true, accounts: { where: { provider: "google" }, select: { id: true }, take: 1 } },
  });
  return users.map((u) => ({ id: u.id, gmail: u.accounts.length > 0 }));
}

async function sweep() {
  const users = await sweepUsers();
  const mode = ingestMode();
  for (const u of users) {
    const job: IngestJob = u.gmail
      ? { userId: u.id, query: await queryFor(u.id), maxResults: SWEEP_MAX_RESULTS, gmail: true }
      : { userId: u.id, gmail: false };
    if (mode === "queue") {
      // Imported lazily so inline deployments never open a Redis connection.
      const { ingestQueue } = await import("@/lib/queue");
      await ingestQueue().add("poll", job, { removeOnComplete: 100, removeOnFail: 50 });
    } else {
      // One user's failure (revoked grant, Gmail outage) must not stop the
      // sweep from reaching everyone after them.
      try {
        const result = await runIngestJob(job);
        console.log(`[sweep] user=${u.id}`, JSON.stringify(result));
      } catch (err) {
        console.error(`[sweep] ingest failed for user=${u.id}:`, err);
        Sentry.captureException(err);
      }
    }
    // Conflict badges come from Google Calendar; a forwarding-only user has
    // none to check against, and listCalendarWindow would only return null.
    if (u.gmail) {
      await refreshConflicts(u.id).catch((err) => {
        console.error("[sweep] conflict refresh failed:", err);
        Sentry.captureException(err);
      });
    }
  }
  if (users.length) {
    console.log(`[sweep] ${mode === "queue" ? "enqueued ingest for" : "ingested"} ${users.length} user(s)`);
  }
  await purge();
}

// The pool sits idle between sweeps and Fly's proxy drops the idle TCP
// connection to lumi-live-db.flycast; Postgres itself isn't reaping (no
// idle_session_timeout). Prisma usually reconnects transparently, but when it
// doesn't the whole sweep dies with P1001 and that run's mail is never scanned.
// Force a round-trip first so a dead socket surfaces here, where we can retry.
const DB_RETRY_CODES = new Set(["P1001", "P1002", "P1017"]);

function isConnectionError(err: unknown): boolean {
  // A server that's unreachable at connect time throws an init error whose
  // errorCode is undefined in Prisma 6, so the class itself is the only signal.
  if (err instanceof Prisma.PrismaClientInitializationError) return true;
  // A pooled socket that died while idle surfaces on the next query as P1001.
  if (err instanceof Prisma.PrismaClientKnownRequestError) return DB_RETRY_CODES.has(err.code);
  if (err instanceof Prisma.PrismaClientUnknownRequestError)
    return /can't reach database server|kind: closed/i.test(err.message);
  return false;
}

// Only the probe is retried, never sweep() itself: a half-finished sweep has
// already enqueued ingest jobs, and replaying it would double-fetch Gmail.
async function waitForDb(): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return;
    } catch (err) {
      if (attempt >= 3 || !isConnectionError(err)) throw err;
      const code = (err as { code?: string }).code ?? (err as Error).constructor.name;
      // The failed probe drops the broken socket from the pool, so the next
      // attempt checks out a fresh connection.
      console.warn(`[sweep] database unreachable (${code}); retry ${attempt}/2`);
      await new Promise((resolve) => setTimeout(resolve, 2_000 * attempt));
    }
  }
}

// A second trigger while a sweep is still running (a cron retry, the timer
// firing during a manual run) joins the one in flight instead of fetching the
// same mail in parallel.
let inFlight: Promise<{ ok: boolean }> | null = null;

function runSweep(): Promise<{ ok: boolean }> {
  if (inFlight) return inFlight;
  inFlight = waitForDb()
    .then(sweep)
    .then(() => ({ ok: true }))
    .catch((err) => {
      console.error("[sweep] failed:", err);
      Sentry.captureException(err);
      return { ok: false };
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

export { sweep, purge, queryFor, refreshConflicts, runSweep };
