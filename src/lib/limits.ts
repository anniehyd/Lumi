/**
 * The three knobs that keep a public deployment's bill bounded. Sign-in is
 * open to anyone with a Google account, so without these the cost of the
 * service is set by whoever shows up.
 *
 *   LUMI_MAX_USERS         accounts that may exist. Sign-ups past it are
 *                          turned away at the door; existing users are never
 *                          affected. Unset = no cap.
 *   LUMI_USER_DAILY_USD    model spend one user may cause per UTC day. Past
 *                          it their mail is still stored and still goes
 *                          through the free tiers (ICS, schema.org), but no
 *                          model call is made. Default 0.50; 0 = no cap.
 *   LUMI_PAUSE_AFTER_DAYS  a user who has not opened Lumi for this many days
 *                          is left out of the scheduled sweep until they come
 *                          back. Default 14; 0 = never pause.
 */
import { prisma } from "@/lib/db";
import { utcDay } from "@/lib/metrics";

function positive(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Explicit 0 (or anything unparseable as positive) turns a default off. */
function withDefault(raw: string | undefined, fallback: number): number | null {
  if (raw === undefined || raw.trim() === "") return fallback;
  return positive(raw);
}

export function maxUsers(): number | null {
  const n = positive(process.env.LUMI_MAX_USERS);
  return n === null ? null : Math.floor(n);
}

export function dailyBudgetUsd(): number | null {
  return withDefault(process.env.LUMI_USER_DAILY_USD, 0.5);
}

export function pauseAfterDays(): number | null {
  return withDefault(process.env.LUMI_PAUSE_AFTER_DAYS, 14);
}

/**
 * Whether a brand-new account may be created right now. Never throws: if the
 * count cannot be read the door stays open, because a database blip must not
 * lock out the people the service is for.
 */
export async function hasRoomForNewUser(): Promise<boolean> {
  const cap = maxUsers();
  if (cap === null) return true;
  try {
    return (await prisma.user.count()) < cap;
  } catch {
    return true;
  }
}

/**
 * True when the scheduled sweep should skip this user. A user who has never
 * been stamped (accounts older than the column) counts as active.
 */
export function isPaused(lastSeenAt: Date | null | undefined, now: Date = new Date()): boolean {
  const days = pauseAfterDays();
  if (days === null || !lastSeenAt) return false;
  return now.getTime() - lastSeenAt.getTime() > days * 24 * 60 * 60 * 1000;
}

// Today's spend per user. The ingest loop writes MetricDaily once per batch,
// not per email, so the database alone would let a single large backfill run
// far past the cap. The tally is seeded from the database the first time a
// user is seen each day and kept current in memory from then on.
const spent = new Map<string, number>();

async function spentToday(userId: string): Promise<number> {
  const day = utcDay();
  const key = `${userId}:${day}`;
  const cached = spent.get(key);
  if (cached !== undefined) return cached;
  let usd = 0;
  try {
    const row = await prisma.metricDaily.findUnique({
      where: { userId_day: { userId, day } },
      select: { llmUsd: true },
    });
    usd = row?.llmUsd ?? 0;
  } catch {
    // Unknown spend reads as none; the cap is a guard, not a gate on ingest.
  }
  // Yesterday's entries are dead weight once the day turns over.
  for (const k of spent.keys()) if (!k.endsWith(`:${day}`)) spent.delete(k);
  spent.set(key, usd);
  return usd;
}

/** May this user's next email go to the model? */
export async function withinDailyBudget(userId: string): Promise<boolean> {
  const cap = dailyBudgetUsd();
  if (cap === null) return true;
  return (await spentToday(userId)) < cap;
}

/** Record what a model call just cost, so the next check sees it. */
export function noteSpend(userId: string, usd: number): void {
  if (!(usd > 0)) return;
  const key = `${userId}:${utcDay()}`;
  spent.set(key, (spent.get(key) ?? 0) + usd);
}

/** Test hook. */
export function resetSpendCache(): void {
  spent.clear();
}
