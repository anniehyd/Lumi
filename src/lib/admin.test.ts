import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));

import { buildOverview, sampleOverview, type MetricRow, type UserRow } from "@/lib/admin";
import { isAdminEmail } from "@/lib/adminAccess";

const NOW = new Date("2026-11-10T15:00:00Z");
const HOUR = 3600_000;
const DAY = 24 * HOUR;
const GMAIL =
  "openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.events";

function user(id: string, over: Partial<UserRow> = {}): UserRow {
  return {
    id,
    name: id,
    email: `${id}@example.edu`,
    image: null,
    createdAt: new Date(NOW.getTime() - 3 * DAY),
    lastSeenAt: new Date(NOW.getTime() - HOUR),
    lastScanAt: new Date(NOW.getTime() - 2 * HOUR),
    onboardedAt: new Date(NOW.getTime() - 3 * DAY),
    forwardingToken: null,
    handshakeFeedUrl: null,
    accounts: [{ scope: GMAIL }],
    ...over,
  };
}

function metric(userId: string, day: string, llmUsd: number, over: Partial<MetricRow> = {}): MetricRow {
  return {
    userId,
    day,
    emailsScanned: 10,
    emailsToModel: 2,
    eventsCreated: 1,
    eventsAccepted: 1,
    acceptsReverted: 0,
    llmUsd,
    ...over,
  };
}

beforeEach(() => {
  delete process.env.LUMI_MAX_USERS;
  delete process.env.LUMI_USER_DAILY_USD;
  delete process.env.LUMI_PAUSE_AFTER_DAYS;
  delete process.env.ADMIN_EMAILS;
});

describe("isAdminEmail", () => {
  it("lets nobody in until ADMIN_EMAILS is set", () => {
    expect(isAdminEmail("me@example.edu")).toBe(false);
  });
  it("matches listed addresses whatever their case or spacing", () => {
    process.env.ADMIN_EMAILS = " Me@Example.edu , other@example.edu";
    expect(isAdminEmail("me@example.edu")).toBe(true);
    expect(isAdminEmail("OTHER@example.edu")).toBe(true);
    expect(isAdminEmail("stranger@example.edu")).toBe(false);
    expect(isAdminEmail(null)).toBe(false);
  });
});

describe("buildOverview", () => {
  it("names each account's state from what it is connected to and when it was last seen", () => {
    const o = buildOverview(
      [
        user("running"),
        user("revoked", { lastScanAt: new Date(NOW.getTime() - 3 * DAY) }),
        user("away", { lastSeenAt: new Date(NOW.getTime() - 20 * DAY) }),
        user("looker", { accounts: [{ scope: "openid email profile" }] }),
        user("forwarder", { accounts: [{ scope: "openid email profile" }], forwardingToken: "t", lastScanAt: null }),
      ],
      [],
      new Map(),
      NOW
    );
    const state = Object.fromEntries(o.users.map((u) => [u.id, u.state]));
    expect(state).toEqual({
      running: "active",
      revoked: "stale",
      away: "paused",
      looker: "no_source",
      // Forwarded mail is pushed, so having no scan stamp is not a fault.
      forwarder: "active",
    });
    expect(o.totals).toMatchObject({ users: 5, gmail: 3, forwarding: 1, paused: 1, noSource: 1, active7d: 4 });
  });

  it("adds up spend by window and puts the most expensive account first", () => {
    const o = buildOverview(
      [user("cheap"), user("dear")],
      [
        metric("cheap", "2026-11-10", 0.01),
        metric("dear", "2026-11-10", 0.2),
        metric("dear", "2026-11-05", 0.5),
        metric("dear", "2026-10-20", 1),
        // Outside the 30-day window: ignored everywhere.
        metric("dear", "2026-09-01", 50),
      ],
      new Map([["dear", 4]]),
      NOW
    );
    expect(o.users.map((u) => u.id)).toEqual(["dear", "cheap"]);
    expect(o.users[0]).toMatchObject({ pending: 4, usdToday: 0.2, emailsToModel: 6 });
    expect(o.users[0].usd).toBeCloseTo(1.7);
    expect(o.totals.usdToday).toBeCloseTo(0.21);
    expect(o.totals.usd7d).toBeCloseTo(0.71);
    expect(o.totals.usd30d).toBeCloseTo(1.71);
    expect(o.totals.usdMonthProjected).toBeCloseTo((0.71 / 7) * 30);
    expect(o.totals.usdPerPayingUser).toBeCloseTo(1.71 / 2);
  });

  it("nets out accepts that were walked back", () => {
    const o = buildOverview(
      [user("u")],
      [metric("u", "2026-11-10", 0, { eventsCreated: 5, eventsAccepted: 3, acceptsReverted: 1 })],
      new Map(),
      NOW
    );
    expect(o.users[0]).toMatchObject({ eventsCreated: 5, eventsAccepted: 2 });
    expect(o.totals.usdPerPayingUser).toBeNull();
  });

  it("charts fourteen days ending today, with the day's sign-ups", () => {
    const o = buildOverview([user("u")], [metric("u", "2026-11-09", 0.3)], new Map(), NOW);
    expect(o.daily).toHaveLength(14);
    expect(o.daily[13].day).toBe("2026-11-10");
    expect(o.daily[12]).toMatchObject({ day: "2026-11-09", usd: 0.3 });
    expect(o.daily.find((d) => d.day === "2026-11-07")?.signups).toBe(1);
  });

  it("reports the limits in force", () => {
    process.env.LUMI_MAX_USERS = "100";
    const o = buildOverview([], [], new Map(), NOW);
    expect(o.limits).toEqual({ maxUsers: 100, dailyBudgetUsd: 0.5, pauseAfterDays: 14, googleUnverifiedCap: 100 });
    expect(o.totals.users).toBe(0);
  });
});

describe("sampleOverview", () => {
  it("is marked as sample data and shows every state", () => {
    const o = sampleOverview(NOW);
    expect(o.sample).toBe(true);
    expect(new Set(o.users.map((u) => u.state))).toEqual(new Set(["active", "stale", "paused", "no_source"]));
    expect(o.users.every((u) => u.email?.endsWith("@example.edu"))).toBe(true);
  });
});
