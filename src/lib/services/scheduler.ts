/**
 * BullMQ worker process. Runs ingestion and reminder jobs from Redis queues.
 * Start with: npm run worker
 */
import { Worker } from "bullmq";
import { connection, type IngestJob, type ReminderJob } from "@/lib/queue";
import { ingestUser } from "@/lib/services/ingest";
import { prisma } from "@/lib/db";

console.log("[worker] starting…");

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
