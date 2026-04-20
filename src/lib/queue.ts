import { Queue } from "bullmq";
import IORedis from "ioredis";

/**
 * Shared BullMQ connection + queue handles.
 * Queues are created lazily so a server without REDIS_URL doesn't crash.
 */

export const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

let _connection: IORedis | null = null;
export function connection(): IORedis {
  if (_connection) return _connection;
  _connection = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
  });
  return _connection;
}

export type IngestJob = { userId: string; query?: string; maxResults?: number };
export type ReminderJob = { eventId: string; userId: string };

let _ingestQueue: Queue<IngestJob> | null = null;
export function ingestQueue(): Queue<IngestJob> {
  if (_ingestQueue) return _ingestQueue;
  _ingestQueue = new Queue<IngestJob>("ingest", { connection: connection() });
  return _ingestQueue;
}

let _reminderQueue: Queue<ReminderJob> | null = null;
export function reminderQueue(): Queue<ReminderJob> {
  if (_reminderQueue) return _reminderQueue;
  _reminderQueue = new Queue<ReminderJob>("reminder", { connection: connection() });
  return _reminderQueue;
}

/**
 * Enqueue a reminder 48h before a Maybe event's start time.
 * No-op if Redis isn't reachable.
 */
export async function scheduleMaybeReminder(
  userId: string,
  eventId: string,
  startTime: Date
): Promise<string | null> {
  try {
    const delay = Math.max(0, startTime.getTime() - Date.now() - 48 * 60 * 60 * 1000);
    const job = await reminderQueue().add(
      "remind",
      { userId, eventId },
      { delay, removeOnComplete: 100, removeOnFail: 50 }
    );
    return job.id ?? null;
  } catch {
    return null;
  }
}
