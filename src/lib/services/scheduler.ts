/**
 * BullMQ worker process. Runs ingestion and reminder jobs from Redis queues.
 * Start with: npm run worker
 */
import { Worker } from "bullmq";
import { connection, ingestQueue, type IngestJob, type ReminderJob } from "@/lib/queue";
import { ingestUser } from "@/lib/services/ingest";
import { prisma } from "@/lib/db";

console.log("[worker] starting…");

// Periodically enqueue an inbox scan for every connected user, so ingestion
// runs unattended (no UI click, no Pub/Sub push required).
// Set INGEST_POLL_MINUTES=0 to disable.
const POLL_MINUTES = Number(process.env.INGEST_POLL_MINUTES ?? "10");

async function sweep() {
  const users = await prisma.user.findMany({
    where: { accounts: { some: { provider: "google" } } },
    select: { id: true },
  });
  for (const u of users) {
    await ingestQueue().add(
      "poll",
      { userId: u.id, query: "newer_than:1d", maxResults: 25 },
      { removeOnComplete: 100, removeOnFail: 50 }
    );
  }
  if (users.length) console.log(`[sweep] enqueued ingest for ${users.length} user(s)`);
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
