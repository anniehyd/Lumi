/**
 * Worker process: fires the inbox sweep at fixed times of day.
 * Start with: npm run worker
 *
 * In the default inline mode that is all it does — the sweep ingests in this
 * process and Redis is never touched. With INGEST_MODE=queue it also runs the
 * BullMQ consumers that execute the jobs the sweep enqueues.
 *
 * A deployment that triggers POST /api/cron/sweep from an external scheduler
 * does not need this process at all.
 */
import { Sentry } from "@/lib/services/instrument";
import type { Worker } from "bullmq";
import { format } from "date-fns";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";
import type { IngestJob, ReminderJob } from "@/lib/queue";
import { prisma } from "@/lib/db";
import { ingestMode, runIngestJob, runSweep } from "@/lib/services/sweep";

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

const workers: Worker[] = [];

async function startQueueConsumers() {
  const { Worker } = await import("bullmq");
  const { connection } = await import("@/lib/queue");

  const ingestWorker = new Worker<IngestJob>(
    "ingest",
    async (job) => {
      console.log(`[ingest] user=${job.data.userId}`);
      const result = await runIngestJob(job.data);
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

  workers.push(ingestWorker, reminderWorker);
}

if (ingestMode() === "queue") {
  console.log("[worker] INGEST_MODE=queue — starting BullMQ consumers");
  startQueueConsumers().catch((err) => {
    console.error("[worker] could not start queue consumers:", err);
    Sentry.captureException(err);
    process.exit(1);
  });
} else {
  console.log("[worker] inline mode — sweeps ingest in this process, Redis not used");
}

function shutdown() {
  console.log("[worker] shutting down…");
  Promise.all(workers.map((w) => w.close())).then(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
