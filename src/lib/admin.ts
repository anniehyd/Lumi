/**
 * The operator's view across every account: who signed up, what each one is
 * connected to, whether their sweeps are running, and what they cost.
 *
 * Read-only, and deliberately shallow: it shows counts and timestamps, never
 * a subject line, a sender or an event title. Running the service needs to
 * know that a user's mail is being read, not what it says.
 */
import { prisma } from "@/lib/db";
import { grantsFromScope } from "@/lib/googleScopes";
import { dailyBudgetUsd, isPaused, maxUsers, pauseAfterDays } from "@/lib/limits";
import { utcDay } from "@/lib/metrics";
import { STALE_MS } from "@/lib/scan";

/** Google's cap on users who may grant Gmail/Calendar to an unverified app. */
export const GOOGLE_UNVERIFIED_CAP = 100;

const DAY_MS = 24 * 60 * 60 * 1000;
/** Days of history in the per-user columns and the spend chart. */
export const WINDOW_DAYS = 30;
export const CHART_DAYS = 14;

export type UserState = "active" | "stale" | "paused" | "no_source";

export type AdminUser = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  createdAt: string;
  lastSeenAt: string | null;
  lastScanAt: string | null;
  onboarded: boolean;
  gmail: boolean;
  forwarding: boolean;
  handshake: boolean;
  state: UserState;
  /** Cards waiting for a decision right now. */
  pending: number;
  /** Trailing WINDOW_DAYS. */
  emailsScanned: number;
  emailsToModel: number;
  eventsCreated: number;
  eventsAccepted: number;
  usd: number;
  usdToday: number;
};

export type DayPoint = { day: string; usd: number; emailsToModel: number; signups: number };

export type AdminOverview = {
  /** True in demo mode: invented rows, so the page can be seen without a database. */
  sample: boolean;
  generatedAt: string;
  totals: {
    users: number;
    onboarded: number;
    gmail: number;
    forwarding: number;
    handshake: number;
    /** Seen in the last 7 days. */
    active7d: number;
    paused: number;
    noSource: number;
    usdToday: number;
    usd7d: number;
    usd30d: number;
    /** usd7d scaled to a 30-day month. */
    usdMonthProjected: number;
    /** usd30d over users that cost anything in the window. Null with none. */
    usdPerPayingUser: number | null;
  };
  limits: {
    maxUsers: number | null;
    dailyBudgetUsd: number | null;
    pauseAfterDays: number | null;
    googleUnverifiedCap: number;
  };
  daily: DayPoint[];
  users: AdminUser[];
};

export type UserRow = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  createdAt: Date;
  lastSeenAt: Date | null;
  lastScanAt: Date | null;
  onboardedAt: Date | null;
  forwardingToken: string | null;
  handshakeFeedUrl: string | null;
  accounts: { scope: string | null }[];
};

export type MetricRow = {
  userId: string;
  day: string;
  emailsScanned: number;
  emailsToModel: number;
  eventsCreated: number;
  eventsAccepted: number;
  acceptsReverted: number;
  llmUsd: number;
};

function stateOf(u: { gmail: boolean; forwarding: boolean; handshake: boolean }, row: UserRow, now: Date): UserState {
  if (!u.gmail && !u.forwarding && !u.handshake) return "no_source";
  if (isPaused(row.lastSeenAt, now)) return "paused";
  // Only Gmail is pulled on a schedule; forwarded mail arrives when it is sent.
  if (u.gmail && (!row.lastScanAt || now.getTime() - row.lastScanAt.getTime() > STALE_MS * 2)) return "stale";
  return "active";
}

/** Pure assembly, so the arithmetic can be tested without a database. */
export function buildOverview(
  rows: UserRow[],
  metrics: MetricRow[],
  pending: Map<string, number>,
  now: Date = new Date(),
  sample = false
): AdminOverview {
  const today = utcDay(now);
  const day7 = utcDay(new Date(now.getTime() - 6 * DAY_MS));
  const day30 = utcDay(new Date(now.getTime() - (WINDOW_DAYS - 1) * DAY_MS));

  const perUser = new Map<string, MetricRow[]>();
  for (const m of metrics) {
    if (m.day < day30) continue;
    const list = perUser.get(m.userId);
    if (list) list.push(m);
    else perUser.set(m.userId, [m]);
  }

  const users: AdminUser[] = rows.map((row) => {
    const grants = grantsFromScope(row.accounts[0]?.scope);
    const src = { gmail: grants.gmail, forwarding: !!row.forwardingToken, handshake: !!row.handshakeFeedUrl };
    const mine = perUser.get(row.id) ?? [];
    const total = (pick: (m: MetricRow) => number) => mine.reduce((n, m) => n + pick(m), 0);
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      image: row.image,
      createdAt: row.createdAt.toISOString(),
      lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
      lastScanAt: row.lastScanAt?.toISOString() ?? null,
      onboarded: !!row.onboardedAt,
      ...src,
      state: stateOf(src, row, now),
      pending: pending.get(row.id) ?? 0,
      emailsScanned: total((m) => m.emailsScanned),
      emailsToModel: total((m) => m.emailsToModel),
      eventsCreated: total((m) => m.eventsCreated),
      eventsAccepted: Math.max(0, total((m) => m.eventsAccepted) - total((m) => m.acceptsReverted)),
      usd: total((m) => m.llmUsd),
      usdToday: mine.filter((m) => m.day === today).reduce((n, m) => n + m.llmUsd, 0),
    };
  });
  // Most expensive first: the row an operator needs to see is the outlier.
  users.sort((a, b) => b.usd - a.usd || b.createdAt.localeCompare(a.createdAt));

  const inWindow = metrics.filter((m) => m.day >= day30);
  const usd30d = inWindow.reduce((n, m) => n + m.llmUsd, 0);
  const usd7d = inWindow.filter((m) => m.day >= day7).reduce((n, m) => n + m.llmUsd, 0);
  const paying = users.filter((u) => u.usd > 0).length;

  const daily: DayPoint[] = [];
  for (let i = CHART_DAYS - 1; i >= 0; i--) {
    const day = utcDay(new Date(now.getTime() - i * DAY_MS));
    const of = inWindow.filter((m) => m.day === day);
    daily.push({
      day,
      usd: of.reduce((n, m) => n + m.llmUsd, 0),
      emailsToModel: of.reduce((n, m) => n + m.emailsToModel, 0),
      signups: rows.filter((r) => utcDay(r.createdAt) === day).length,
    });
  }

  const weekAgo = now.getTime() - 7 * DAY_MS;
  return {
    sample,
    generatedAt: now.toISOString(),
    totals: {
      users: users.length,
      onboarded: users.filter((u) => u.onboarded).length,
      gmail: users.filter((u) => u.gmail).length,
      forwarding: users.filter((u) => u.forwarding).length,
      handshake: users.filter((u) => u.handshake).length,
      active7d: rows.filter((r) => r.lastSeenAt && r.lastSeenAt.getTime() >= weekAgo).length,
      paused: users.filter((u) => u.state === "paused").length,
      noSource: users.filter((u) => u.state === "no_source").length,
      usdToday: users.reduce((n, u) => n + u.usdToday, 0),
      usd7d,
      usd30d,
      usdMonthProjected: (usd7d / 7) * 30,
      usdPerPayingUser: paying ? usd30d / paying : null,
    },
    limits: {
      maxUsers: maxUsers(),
      dailyBudgetUsd: dailyBudgetUsd(),
      pauseAfterDays: pauseAfterDays(),
      googleUnverifiedCap: GOOGLE_UNVERIFIED_CAP,
    },
    daily,
    users,
  };
}

export async function loadAdminOverview(now: Date = new Date()): Promise<AdminOverview> {
  const since = utcDay(new Date(now.getTime() - (WINDOW_DAYS - 1) * DAY_MS));
  const [rows, metrics, pendingRows] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        createdAt: true,
        lastSeenAt: true,
        lastScanAt: true,
        onboardedAt: true,
        forwardingToken: true,
        handshakeFeedUrl: true,
        accounts: { where: { provider: "google" }, select: { scope: true }, take: 1 },
      },
    }),
    prisma.metricDaily.findMany({
      where: { day: { gte: since } },
      select: {
        userId: true,
        day: true,
        emailsScanned: true,
        emailsToModel: true,
        eventsCreated: true,
        eventsAccepted: true,
        acceptsReverted: true,
        llmUsd: true,
      },
    }),
    prisma.event.groupBy({ by: ["userId"], where: { status: "PENDING" }, _count: { _all: true } }),
  ]);
  const pending = new Map(pendingRows.map((p) => [p.userId, p._count._all]));
  return buildOverview(rows, metrics, pending, now);
}

/**
 * Invented accounts for demo mode, where there is no database and nobody to
 * be an admin. Deterministic, so the page looks the same on every load.
 */
export function sampleOverview(now: Date = new Date()): AdminOverview {
  const GMAIL = "openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.events";
  const people: [string, number, number | null, number | null, "gmail" | "forward" | "none", boolean, number][] = [
    // name, joined days ago, seen days ago, scanned hours ago, source, handshake, daily usd
    ["Maya Okafor", 9, 0, 3, "gmail", true, 0.041],
    ["Daniel Reyes", 9, 1, 3, "gmail", false, 0.068],
    ["Priya Nair", 8, 0, 3, "gmail", true, 0.022],
    ["Leo Tanaka", 7, 2, null, "forward", true, 0.009],
    ["Hannah Weiss", 6, 0, 3, "gmail", false, 0.117],
    ["Omar Haddad", 6, 5, 3, "gmail", false, 0.015],
    ["Chloe Martin", 5, 0, null, "forward", false, 0.006],
    ["Samir Patel", 4, 1, 51, "gmail", true, 0.03],
    ["Grace Lin", 3, 3, null, "none", false, 0],
    ["Noah Berg", 22, 19, 120, "gmail", false, 0.012],
    ["Aisha Bello", 2, 0, 3, "gmail", true, 0.054],
    ["Ethan Brooks", 1, 0, null, "none", false, 0],
  ];
  const at = (days: number) => new Date(now.getTime() - days * DAY_MS);
  const rows: UserRow[] = people.map(([name, joined, seen, scanned, source, handshake], i) => ({
    id: `sample-${i}`,
    name,
    email: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.edu`,
    image: null,
    createdAt: at(joined),
    lastSeenAt: seen === null ? null : at(seen),
    lastScanAt: scanned === null ? null : new Date(now.getTime() - scanned * 3600_000),
    onboardedAt: source === "none" && joined < 2 ? null : at(joined),
    forwardingToken: source === "forward" ? "sample" : null,
    handshakeFeedUrl: handshake ? "sample" : null,
    accounts: [{ scope: source === "gmail" ? GMAIL : "openid email profile" }],
  }));
  const metrics: MetricRow[] = [];
  people.forEach(([, joined, seen, , , , usd], i) => {
    if (usd === 0) return;
    const pausedFrom = seen !== null && seen > 14 ? seen - 14 : -1;
    for (let d = Math.min(joined, WINDOW_DAYS - 1); d >= 0; d--) {
      if (d < pausedFrom) continue;
      // A steady wobble plus a first-day backfill, so the chart has a shape.
      const wobble = 0.6 + ((i * 7 + d * 13) % 10) / 12;
      const factor = d === joined ? 6 : wobble;
      const calls = Math.max(1, Math.round((usd * factor) / 0.0024));
      metrics.push({
        userId: `sample-${i}`,
        day: utcDay(at(d)),
        emailsScanned: calls * 6,
        emailsToModel: calls,
        eventsCreated: Math.round(calls / 3),
        eventsAccepted: Math.round(calls / 8),
        acceptsReverted: 0,
        llmUsd: usd * factor,
      });
    }
  });
  const pending = new Map(rows.map((r, i) => [r.id, people[i][4] === "none" ? 0 : (i * 3) % 8]));
  return buildOverview(rows, metrics, pending, now, true);
}
