/**
 * The inbox sweep: enqueue an ingest job per connected user, refresh calendar
 * conflict badges, then purge anything outside the retention window.
 *
 * Extracted from the worker so it has two callers: the worker's wall-clock
 * timer, and POST /api/cron/sweep for an external scheduler. Importing the
 * worker module itself would spawn BullMQ consumers inside the web process.
 */
import { Sentry } from "@/lib/services/instrument";
import { ingestQueue } from "@/lib/queue";
import { MAIL_FILTER } from "@/lib/services/gmail";
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

async function sweep() {
  const users = await prisma.user.findMany({
    where: { accounts: { some: { provider: "google" } } },
    select: { id: true },
  });
  for (const u of users) {
    await ingestQueue().add(
      "poll",
      // One list page per sweep, and the incremental floor advances past whatever
      // isn't fetched — so the cap has to cover a full half-day of mail.
      { userId: u.id, query: await queryFor(u.id), maxResults: 250 },
      { removeOnComplete: 100, removeOnFail: 50 }
    );
    await refreshConflicts(u.id).catch((err) => {
      console.error("[sweep] conflict refresh failed:", err);
      Sentry.captureException(err);
    });
  }
  if (users.length) console.log(`[sweep] enqueued ingest for ${users.length} user(s)`);
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

function runSweep() {
  return waitForDb()
    .then(sweep)
    .catch((err) => {
      console.error("[sweep] failed:", err);
      Sentry.captureException(err);
    });
}

export { sweep, purge, queryFor, refreshConflicts, runSweep };
