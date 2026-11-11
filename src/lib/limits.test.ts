import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  user: { count: vi.fn() },
  metricDaily: { findUnique: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ prisma: db }));

import {
  dailyBudgetUsd,
  hasRoomForNewUser,
  isPaused,
  maxUsers,
  noteSpend,
  pauseAfterDays,
  resetSpendCache,
  withinDailyBudget,
} from "@/lib/limits";

const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  vi.resetAllMocks();
  resetSpendCache();
  delete process.env.LUMI_MAX_USERS;
  delete process.env.LUMI_USER_DAILY_USD;
  delete process.env.LUMI_PAUSE_AFTER_DAYS;
});

describe("the knobs", () => {
  it("has no user cap unless one is set", () => {
    expect(maxUsers()).toBeNull();
    process.env.LUMI_MAX_USERS = "100";
    expect(maxUsers()).toBe(100);
    process.env.LUMI_MAX_USERS = "nonsense";
    expect(maxUsers()).toBeNull();
  });

  it("defaults the budget and the pause, and lets 0 switch either off", () => {
    expect(dailyBudgetUsd()).toBe(0.5);
    expect(pauseAfterDays()).toBe(14);
    process.env.LUMI_USER_DAILY_USD = "0";
    process.env.LUMI_PAUSE_AFTER_DAYS = "0";
    expect(dailyBudgetUsd()).toBeNull();
    expect(pauseAfterDays()).toBeNull();
    process.env.LUMI_USER_DAILY_USD = "0.1";
    expect(dailyBudgetUsd()).toBe(0.1);
  });
});

describe("hasRoomForNewUser", () => {
  it("never asks the database when there is no cap", async () => {
    expect(await hasRoomForNewUser()).toBe(true);
    expect(db.user.count).not.toHaveBeenCalled();
  });

  it("closes the door at the cap, not before", async () => {
    process.env.LUMI_MAX_USERS = "3";
    db.user.count.mockResolvedValue(2);
    expect(await hasRoomForNewUser()).toBe(true);
    db.user.count.mockResolvedValue(3);
    expect(await hasRoomForNewUser()).toBe(false);
  });

  it("stays open when the count cannot be read", async () => {
    process.env.LUMI_MAX_USERS = "3";
    db.user.count.mockRejectedValue(new Error("db down"));
    expect(await hasRoomForNewUser()).toBe(true);
  });
});

describe("isPaused", () => {
  const now = new Date("2026-11-10T12:00:00Z");
  it("pauses only someone seen longer ago than the window", () => {
    expect(isPaused(new Date(now.getTime() - 13 * DAY), now)).toBe(false);
    expect(isPaused(new Date(now.getTime() - 15 * DAY), now)).toBe(true);
  });
  it("treats a never-stamped account as active", () => {
    expect(isPaused(null, now)).toBe(false);
  });
  it("never pauses when switched off", () => {
    process.env.LUMI_PAUSE_AFTER_DAYS = "0";
    expect(isPaused(new Date(now.getTime() - 400 * DAY), now)).toBe(false);
  });
});

describe("the daily budget", () => {
  it("starts from what the database already recorded today", async () => {
    db.metricDaily.findUnique.mockResolvedValue({ llmUsd: 0.6 });
    expect(await withinDailyBudget("u1")).toBe(false);
  });

  it("counts spend within a batch that has not been written yet", async () => {
    process.env.LUMI_USER_DAILY_USD = "0.01";
    db.metricDaily.findUnique.mockResolvedValue(null);
    expect(await withinDailyBudget("u1")).toBe(true);
    noteSpend("u1", 0.006);
    expect(await withinDailyBudget("u1")).toBe(true);
    noteSpend("u1", 0.006);
    expect(await withinDailyBudget("u1")).toBe(false);
    // One read seeds the tally; after that it is kept in memory.
    expect(db.metricDaily.findUnique).toHaveBeenCalledTimes(1);
  });

  it("keeps each user's tally apart", async () => {
    process.env.LUMI_USER_DAILY_USD = "0.01";
    db.metricDaily.findUnique.mockResolvedValue(null);
    await withinDailyBudget("u1");
    noteSpend("u1", 1);
    expect(await withinDailyBudget("u2")).toBe(true);
  });

  it("lets mail through when spend cannot be read, and when the cap is off", async () => {
    db.metricDaily.findUnique.mockRejectedValue(new Error("db down"));
    expect(await withinDailyBudget("u1")).toBe(true);
    process.env.LUMI_USER_DAILY_USD = "0";
    noteSpend("u1", 99);
    expect(await withinDailyBudget("u1")).toBe(true);
  });
});
