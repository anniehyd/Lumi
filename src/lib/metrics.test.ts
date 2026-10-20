import { beforeEach, describe, expect, it, vi } from "vitest";

const upsert = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ prisma: { metricDaily: { upsert, findMany: vi.fn() } } }));

import { decisionDelta, recordMetrics, sum, summarize, utcDay } from "@/lib/metrics";

const assumptions = { minutesPerManualEntry: 2, secondsPerCardReview: 10 };

describe("decisionDelta", () => {
  it("counts a transition into each decision", () => {
    expect(decisionDelta("PENDING", "ACCEPTED")).toEqual({ eventsAccepted: 1 });
    expect(decisionDelta("PENDING", "DECLINED")).toEqual({ eventsDeclined: 1 });
    expect(decisionDelta("PENDING", "MAYBE")).toEqual({ eventsMaybe: 1 });
  });

  it("counts walking an accept back", () => {
    expect(decisionDelta("ACCEPTED", "DECLINED")).toEqual({ eventsDeclined: 1, acceptsReverted: 1 });
    expect(decisionDelta("ACCEPTED", "PENDING")).toEqual({ acceptsReverted: 1 });
  });

  it("counts nothing when the status did not change", () => {
    expect(decisionDelta("ACCEPTED", "ACCEPTED")).toEqual({});
  });
});

describe("summarize", () => {
  it("reports no data rather than a row of zeros", () => {
    const s = summarize([], 7, assumptions);
    expect(s.hasData).toBe(false);
    expect(s.modelRate).toBeNull();
    expect(s.acceptRate).toBeNull();
    expect(s.usdPerAccepted).toBeNull();
    expect(s.minutesSavedPerWeek).toBe(0);
  });

  it("adds days together", () => {
    const totals = sum([
      { emailsScanned: 100, emailsToModel: 9 },
      { emailsScanned: 60, emailsToModel: 3, eventsCreated: 4 },
    ]);
    expect(totals).toMatchObject({ emailsScanned: 160, emailsToModel: 12, eventsCreated: 4 });
  });

  it("derives the funnel rates", () => {
    const s = summarize(
      [
        {
          emailsScanned: 200,
          emailsSkipped: 176,
          emailsToModel: 20,
          eventsFound: 14,
          eventsCreated: 10,
          eventsAccepted: 7,
          eventsDeclined: 2,
          acceptsReverted: 1,
          llmUsd: 0.06,
        },
      ],
      7,
      assumptions
    );
    expect(s.hasData).toBe(true);
    expect(s.netAccepted).toBe(6);
    expect(s.modelRate).toBeCloseTo(0.1);
    expect(s.acceptRate).toBeCloseTo(6 / 8);
    expect(s.usdPerAccepted).toBeCloseTo(0.01);
  });

  it("computes time saved: entries avoided minus cards reviewed", () => {
    // 6 net accepts × 2 min = 12 min saved; 10 cards × 10 s = 1.67 min spent.
    const s = summarize([{ eventsCreated: 10, eventsAccepted: 6 }], 7, assumptions);
    expect(s.minutesSavedPerWeek).toBeCloseTo(12 - 10 / 6, 5);
  });

  it("scales to a weekly figure for longer windows", () => {
    const s = summarize([{ eventsCreated: 10, eventsAccepted: 6 }], 14, assumptions);
    expect(s.minutesSavedPerWeek).toBeCloseTo((12 - 10 / 6) / 2, 5);
  });

  it("never reports negative time saved", () => {
    const s = summarize([{ eventsCreated: 50, eventsAccepted: 0 }], 7, assumptions);
    expect(s.minutesSavedPerWeek).toBe(0);
  });

  it("does not let reverts push net accepts below zero", () => {
    const s = summarize([{ eventsAccepted: 1, acceptsReverted: 3 }], 7, assumptions);
    expect(s.netAccepted).toBe(0);
  });
});

describe("recordMetrics", () => {
  beforeEach(() => {
    upsert.mockReset();
  });

  it("upserts today's row with increments", async () => {
    upsert.mockResolvedValue({});
    await recordMetrics("u1", { emailsScanned: 3, emailsToModel: 1, eventsCreated: 0 });

    expect(upsert).toHaveBeenCalledTimes(1);
    const args = upsert.mock.calls[0][0];
    expect(args.where).toEqual({ userId_day: { userId: "u1", day: utcDay() } });
    expect(args.create).toEqual({ userId: "u1", day: utcDay(), emailsScanned: 3, emailsToModel: 1 });
    expect(args.update).toEqual({ emailsScanned: { increment: 3 }, emailsToModel: { increment: 1 } });
  });

  it("writes nothing when there is nothing to add", async () => {
    await recordMetrics("u1", {});
    await recordMetrics("u1", { emailsScanned: 0 });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("swallows a database failure — metrics must never break the caller", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    upsert.mockImplementation(async () => {
      throw new Error("db down");
    });
    await expect(recordMetrics("u1", { emailsScanned: 1 })).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith("[metrics] write failed:", "db down");
    error.mockRestore();
  });
});
