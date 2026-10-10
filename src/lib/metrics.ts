import { prisma } from "@/lib/db";

/**
 * Pipeline funnel counters and the numbers derived from them.
 * Definitions and the time-saved formula are documented in docs/METRICS.md —
 * change them there and here together.
 */

export type Counters = {
  emailsScanned: number;
  emailsSkipped: number;
  emailsToModel: number;
  eventsFound: number;
  eventsCreated: number;
  eventsAccepted: number;
  eventsDeclined: number;
  eventsMaybe: number;
  acceptsReverted: number;
  llmInputTokens: number;
  llmOutputTokens: number;
  llmUsd: number;
};

export const ZERO: Counters = {
  emailsScanned: 0,
  emailsSkipped: 0,
  emailsToModel: 0,
  eventsFound: 0,
  eventsCreated: 0,
  eventsAccepted: 0,
  eventsDeclined: 0,
  eventsMaybe: 0,
  acceptsReverted: 0,
  llmInputTokens: 0,
  llmOutputTokens: 0,
  llmUsd: 0,
};

const KEYS = Object.keys(ZERO) as (keyof Counters)[];

export function utcDay(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Add to today's row for this user. Never throws: a metrics write must not
 * take down an ingest or a user's click.
 */
export async function recordMetrics(userId: string, delta: Partial<Counters>): Promise<void> {
  const nonZero = KEYS.filter((k) => (delta[k] ?? 0) !== 0);
  if (nonZero.length === 0) return;
  const day = utcDay();
  try {
    await prisma.metricDaily.upsert({
      where: { userId_day: { userId, day } },
      create: { userId, day, ...Object.fromEntries(nonZero.map((k) => [k, delta[k]])) },
      update: Object.fromEntries(nonZero.map((k) => [k, { increment: delta[k] }])),
    });
  } catch (err) {
    console.error("[metrics] write failed:", err instanceof Error ? err.message : err);
  }
}

type Decision = "PENDING" | "ACCEPTED" | "MAYBE" | "DECLINED" | string;

/** The counter changes implied by one status change on an event card. */
export function decisionDelta(from: Decision, to: Decision): Partial<Counters> {
  if (from === to) return {};
  const delta: Partial<Counters> = {};
  if (to === "ACCEPTED") delta.eventsAccepted = 1;
  if (to === "DECLINED") delta.eventsDeclined = 1;
  if (to === "MAYBE") delta.eventsMaybe = 1;
  if (from === "ACCEPTED") delta.acceptsReverted = 1;
  return delta;
}

export function sum(rows: Partial<Counters>[]): Counters {
  const total = { ...ZERO };
  for (const row of rows) for (const k of KEYS) total[k] += row[k] ?? 0;
  return total;
}

/**
 * Assumptions behind "time saved". Both are estimates, not measurements —
 * override with the env vars once you have timed yourself.
 */
export type TimeAssumptions = {
  /** Minutes to read an invitation and create the calendar entry by hand. */
  minutesPerManualEntry: number;
  /** Seconds to read one Lumi card and decide. */
  secondsPerCardReview: number;
};

export function timeAssumptions(): TimeAssumptions {
  const num = (raw: string | undefined, fallback: number) => {
    const n = Number(raw);
    return raw !== undefined && raw !== "" && Number.isFinite(n) && n >= 0 ? n : fallback;
  };
  return {
    minutesPerManualEntry: num(process.env.METRICS_MINUTES_PER_MANUAL_ENTRY, 2),
    secondsPerCardReview: num(process.env.METRICS_SECONDS_PER_CARD_REVIEW, 10),
  };
}

export type Summary = {
  days: number;
  totals: Counters;
  /** Accepts that were not later walked back. */
  netAccepted: number;
  /** Share of scanned emails that reached the model. Null when nothing was scanned. */
  modelRate: number | null;
  /** netAccepted / (netAccepted + declined). Null until something has been decided. */
  acceptRate: number | null;
  /** Model spend per net accepted event, USD. Null with no accepts. */
  usdPerAccepted: number | null;
  /** Net minutes saved per week, floored at 0. See docs/METRICS.md. */
  minutesSavedPerWeek: number;
  assumptions: TimeAssumptions;
  /** False when there is nothing to report — say so rather than print zeros as results. */
  hasData: boolean;
};

export function summarize(
  rows: Partial<Counters>[],
  days: number,
  assumptions: TimeAssumptions = timeAssumptions()
): Summary {
  const totals = sum(rows);
  const netAccepted = Math.max(0, totals.eventsAccepted - totals.acceptsReverted);
  const decided = netAccepted + totals.eventsDeclined;
  // Every card shown costs a review, whether or not it was acted on.
  const savedMinutes =
    netAccepted * assumptions.minutesPerManualEntry -
    (totals.eventsCreated * assumptions.secondsPerCardReview) / 60;
  const weeks = Math.max(days, 1) / 7;

  return {
    days,
    totals,
    netAccepted,
    modelRate: totals.emailsScanned > 0 ? totals.emailsToModel / totals.emailsScanned : null,
    acceptRate: decided > 0 ? netAccepted / decided : null,
    usdPerAccepted: netAccepted > 0 ? totals.llmUsd / netAccepted : null,
    minutesSavedPerWeek: Math.max(0, savedMinutes) / weeks,
    assumptions,
    hasData: totals.emailsScanned > 0 || totals.eventsCreated > 0 || decided > 0,
  };
}

/** Rows for one user over the trailing `days` (UTC days, inclusive of today). */
export async function loadSummary(userId: string, days: number): Promise<Summary> {
  const since = utcDay(new Date(Date.now() - (days - 1) * 86_400_000));
  const rows = await prisma.metricDaily.findMany({ where: { userId, day: { gte: since } } });
  return summarize(rows, days);
}
