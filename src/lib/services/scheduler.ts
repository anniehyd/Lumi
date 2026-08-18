/**
 * BullMQ worker process. Runs ingestion and reminder jobs from Redis queues.
 * Start with: npm run worker
 */
import { Worker } from "bullmq";
import { connection, ingestQueue, type IngestJob, type ReminderJob } from "@/lib/queue";
import { ingestUser } from "@/lib/services/ingest";
import { listCalendarWindow, findConflict } from "@/lib/services/calendar";
import { prisma } from "@/lib/db";

console.log("[worker] starting…");

// Periodically enqueue an inbox scan for every connected user, so ingestion
// runs unattended (no UI click, no Pub/Sub push required).
// Set INGEST_POLL_MINUTES=0 to disable.
const POLL_MINUTES = Number(process.env.INGEST_POLL_MINUTES ?? "10");

const WINDOW_DAYS = 14;
const WINDOW_MS = WINDOW_DAYS * 24 * 60 * 60 * 1000;
const JUNK_FILTER = "-category:promotions -category:social";

// Incremental query: only list mail newer than what we've already ingested
// (1h overlap; messageId dedup absorbs it). First run backfills the window.
async function queryFor(userId: string): Promise<string> {
  const latest = await prisma.email.findFirst({
    where: { userId },
    orderBy: { receivedAt: "desc" },
    select: { receivedAt: true },
  });
  if (!latest) return `newer_than:${WINDOW_DAYS}d ${JUNK_FILTER}`;
  const floor = Date.now() - WINDOW_MS;
  const after = Math.max(latest.receivedAt.getTime() - 60 * 60 * 1000, floor);
  return `after:${Math.floor(after / 1000)} ${JUNK_FILTER}`;
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
      { userId: u.id, query: await queryFor(u.id), maxResults: 100 },
      { removeOnComplete: 100, removeOnFail: 50 }
    );
    await refreshConflicts(u.id).catch((err) =>
      console.error("[sweep] conflict refresh failed:", err)
    );
  }
  if (users.length) console.log(`[sweep] enqueued ingest for ${users.length} user(s)`);
  await purge();
}

if (POLL_MINUTES > 0) {
  console.log(`[worker] sweeping inboxes every ${POLL_MINUTES}m`);
  sweep().catch((err) => console.error("[sweep] failed:", err));
  setInterval(
    () => sweep().catch((err) => console.error("[sweep] failed:", err)),
    POLL_MINUTES * 60 * 1000
  );
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
});
reminderWorker.on("failed", (job, err) => {
  console.error(`[reminder:failed] ${job?.id}:`, err.message);
});

function shutdown() {
  console.log("[worker] shutting down…");
  Promise.all([ingestWorker.close(), reminderWorker.close()]).then(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
