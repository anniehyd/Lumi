/**
 * BullMQ worker process. Runs ingestion and reminder jobs from Redis queues.
 * Start with: npm run worker
 */
import { Sentry } from "@/lib/services/instrument";
import { Worker } from "bullmq";
import { format } from "date-fns";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";
import { connection, ingestQueue, type IngestJob, type ReminderJob } from "@/lib/queue";
import { ingestUser } from "@/lib/services/ingest";
import { MAIL_FILTER } from "@/lib/services/gmail";
import { listCalendarWindow, findConflict } from "@/lib/services/calendar";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

console.log("[worker] starting…");

// Enqueue an inbox scan for every connected user at fixed times of day, so
// ingestion runs unattended (no UI click, no Pub/Sub push required).
// Sweeping is deliberately tied to when someone actually opens Lumi — scanning
// in between burns Gmail/Calendar quota and machine time for nobody.
//   INGEST_SWEEP_TIMES  comma-separated HH:MM (24h) in INGEST_SWEEP_TZ; empty disables
//   INGEST_SWEEP_TZ     IANA zone the times are read in
//   INGEST_SWEEP_ON_START  also sweep once at boot (useful in dev; off by default
//                          so restarts don't add unscheduled scans)
const SWEEP_TZ = process.env.INGEST_SWEEP_TZ || "America/New_York";
const SWEEP_TIMES = parseSweepTimes(process.env.INGEST_SWEEP_TIMES ?? "13:00,19:00");
const SWEEP_ON_START = process.env.INGEST_SWEEP_ON_START === "true";

function parseSweepTimes(raw: string): { h: number; m: number }[] {
  const times: { h: number; m: number }[] = [];
  for (const part of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(part);
    const h = match ? Number(match[1]) : NaN;
    const m = match ? Number(match[2]) : NaN;
    if (!match || h > 23 || m > 59) {
      console.error(`[worker] ignoring malformed INGEST_SWEEP_TIMES entry: "${part}" (want HH:MM)`);
      continue;
    }
    times.push({ h, m });
  }
  return times.sort((a, b) => a.h - b.h || a.m - b.m);
}

const hhmm = (t: { h: number; m: number }) =>
  `${String(t.h).padStart(2, "0")}:${String(t.m).padStart(2, "0")}`;

// Earliest configured time strictly after `from`. Checking today and tomorrow
// in the target zone covers the wrap-around; fromZonedTime does the DST math.
function nextSweepAt(from: Date): Date {
  const local = toZonedTime(from, SWEEP_TZ);
  let best: Date | null = null;
  for (const dayOffset of [0, 1]) {
    const day = new Date(local.getFullYear(), local.getMonth(), local.getDate() + dayOffset);
    const stamp = format(day, "yyyy-MM-dd");
    for (const t of SWEEP_TIMES) {
      const at = fromZonedTime(`${stamp} ${hhmm(t)}:00`, SWEEP_TZ);
      if (at.getTime() > from.getTime() && (!best || at < best)) best = at;
    }
  }
  // SWEEP_TIMES is non-empty here, so today ∪ tomorrow always yields a match.
  return best!;
}

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

// One timer per sweep, re-armed after each run, so the schedule stays pinned to
// wall-clock times across DST shifts and long-running processes.
function scheduleNextSweep() {
  const at = nextSweepAt(new Date());
  const delayMs = Math.max(at.getTime() - Date.now(), 0);
  console.log(
    `[worker] next inbox sweep ${formatInTimeZone(at, SWEEP_TZ, "yyyy-MM-dd HH:mm zzz")}` +
      ` (in ${Math.round(delayMs / 60_000)}m)`
  );
  setTimeout(() => {
    runSweep().finally(scheduleNextSweep);
  }, Math.max(delayMs, 1_000));
}

if (SWEEP_TIMES.length) {
  console.log(`[worker] sweeping inboxes at ${SWEEP_TIMES.map(hhmm).join(", ")} ${SWEEP_TZ}`);
  if (SWEEP_ON_START) runSweep();
  scheduleNextSweep();
} else {
  console.log("[worker] scheduled sweeps disabled (INGEST_SWEEP_TIMES is empty)");
}

const ingestWorker = new Worker<IngestJob>(
  "ingest",
  async (job) => {
    console.log(`[ingest] user=${job.data.userId}`);
    const result = await ingestUser(job.data.userId, {
      query: job.data.query,
      maxResults: job.data.maxResults,
    });
    console.log(`[ingest] done`, result);
    return result;
  },
  { connection: connection(), concurrency: 2 }
);

const reminderWorker = new Worker<ReminderJob>(
  "reminder",
  async (job) => {
    const event = await prisma.event.findFirst({
      where: { id: job.data.eventId, userId: job.data.userId },
    });
    if (!event || event.status !== "MAYBE") {
      console.log(`[reminder] skipped — event resolved or missing: ${job.data.eventId}`);
      return { skipped: true };
    }
    // Surface as a PENDING nudge by bumping updatedAt; UI can highlight fresh ones.
    await prisma.event.update({
      where: { id: event.id },
      data: { updatedAt: new Date() },
    });
    console.log(`[reminder] poked event: ${event.title}`);
    return { poked: true };
  },
  { connection: connection(), concurrency: 4 }
);

ingestWorker.on("failed", (job, err) => {
  console.error(`[ingest:failed] ${job?.id}:`, err.message);
  Sentry.captureException(err);
});
reminderWorker.on("failed", (job, err) => {
  console.error(`[reminder:failed] ${job?.id}:`, err.message);
  Sentry.captureException(err);
});

function shutdown() {
  console.log("[worker] shutting down…");
  Promise.all([ingestWorker.close(), reminderWorker.close()]).then(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
