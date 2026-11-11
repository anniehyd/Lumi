import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  user: { findMany: vi.fn() },
  email: { findFirst: vi.fn(), deleteMany: vi.fn() },
  event: { findMany: vi.fn(), deleteMany: vi.fn(), update: vi.fn() },
  llmUsage: { deleteMany: vi.fn() },
}));
const ingest = vi.hoisted(() => ({
  ingestUser: vi.fn(),
  ingestHandshake: vi.fn(),
  retryUnprocessed: vi.fn(),
}));
const queueAdd = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/services/ingest", () => ingest);
vi.mock("@/lib/services/instrument", () => ({ Sentry: { captureException: vi.fn() } }));
vi.mock("@/lib/services/calendar", () => ({ listCalendarWindow: vi.fn(), findConflict: vi.fn() }));
vi.mock("@/lib/services/gmail", () => ({ MAIL_FILTER: "in:inbox" }));
// If inline mode ever reached for the queue, this is what it would hit.
vi.mock("@/lib/queue", () => ({ ingestQueue: () => ({ add: queueAdd }) }));

import { ingestMode, queryFor, runIngestJob, runSweep, purge } from "@/lib/services/sweep";

beforeEach(() => {
  vi.resetAllMocks();
  delete process.env.INGEST_MODE;
  db.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
  db.user.findMany.mockResolvedValue([
    { id: "u1", forwardingToken: null, accounts: [{ scope: "openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.events" }] },
    { id: "u2", forwardingToken: null, accounts: [{ scope: "openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.events" }] },
  ]);
  db.email.findFirst.mockResolvedValue(null);
  db.email.deleteMany.mockResolvedValue({ count: 0 });
  db.event.findMany.mockResolvedValue([]);
  db.event.deleteMany.mockResolvedValue({ count: 0 });
  db.llmUsage.deleteMany.mockResolvedValue({ count: 0 });
  ingest.ingestUser.mockResolvedValue({ fetched: 0, newEmails: 0, skipped: 0, sentToModel: 0, eventsCreated: 0, failed: 0 });
  ingest.ingestHandshake.mockResolvedValue({ configured: false, fetched: 0, eventsCreated: 0 });
  ingest.retryUnprocessed.mockResolvedValue({ retried: 0, recovered: 0, eventsCreated: 0 });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("ingestMode", () => {
  it("is inline unless queue is asked for explicitly", () => {
    expect(ingestMode()).toBe("inline");
    process.env.INGEST_MODE = "QUEUE";
    expect(ingestMode()).toBe("queue");
    process.env.INGEST_MODE = "something-else";
    expect(ingestMode()).toBe("inline");
  });
});

describe("queryFor", () => {
  it("backfills the 14-day window on a first run", async () => {
    expect(await queryFor("u1")).toBe("newer_than:14d in:inbox");
  });

  it("asks only for mail newer than the last one ingested, with an hour of overlap", async () => {
    const latest = new Date(Date.now() - 3 * 3600_000);
    db.email.findFirst.mockResolvedValue({ receivedAt: latest });
    const after = Math.floor((latest.getTime() - 3600_000) / 1000);
    expect(await queryFor("u1")).toBe(`after:${after} in:inbox`);
  });
});

describe("queryFor — mail dated in the future", () => {
  it("never lets a row dated in the future set the floor", async () => {
    await queryFor("u1");
    const where = db.email.findFirst.mock.calls[0][0].where;
    expect(where.userId).toBe("u1");
    expect(where.receivedAt.lte.getTime()).toBeLessThanOrEqual(Date.now());
  });
});

describe("purge", () => {
  it("keeps a decided event until it has happened, however long ago it was decided", async () => {
    await purge();
    const or = db.event.deleteMany.mock.calls[0][0].where.OR as Record<string, unknown>[];
    // No rule deletes by updatedAt: an event accepted today for next month stays.
    expect(or.some((rule) => "updatedAt" in rule)).toBe(false);
    expect(or).toContainEqual({ startTime: { lt: expect.any(Date) } });
  });

  it("keeps an undecided all-day event until its day is over", async () => {
    await purge();
    const or = db.event.deleteMany.mock.calls[0][0].where.OR as Record<string, unknown>[];
    expect(or).toContainEqual({ status: { in: ["PENDING", "MAYBE"] }, isAllDay: true, endTime: { lt: expect.any(Date) } });
    expect(or).toContainEqual({ status: { in: ["PENDING", "MAYBE"] }, isAllDay: false, startTime: { lt: expect.any(Date) } });
  });
});

describe("runSweep — inline mode", () => {
  it("ingests every connected user in-process and never touches the queue", async () => {
    await expect(runSweep()).resolves.toEqual({ ok: true });

    expect(ingest.ingestUser.mock.calls.map((c) => c[0])).toEqual(["u1", "u2"]);
    expect(ingest.ingestHandshake).toHaveBeenCalledTimes(2);
    expect(ingest.retryUnprocessed).toHaveBeenCalledTimes(2);
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it("carries on to the next user when one user's ingest fails", async () => {
    ingest.ingestUser.mockRejectedValueOnce(new Error("grant revoked"));
    await expect(runSweep()).resolves.toEqual({ ok: true });
    expect(ingest.ingestUser).toHaveBeenCalledTimes(2);
  });

  it("purges data past the retention window at the end", async () => {
    await runSweep();
    expect(db.event.deleteMany).toHaveBeenCalledTimes(1);
    expect(db.email.deleteMany).toHaveBeenCalledTimes(1);
  });

  it("joins a sweep already in flight instead of starting a second", async () => {
    const [a, b] = await Promise.all([runSweep(), runSweep()]);
    expect(a).toEqual({ ok: true });
    expect(b).toEqual({ ok: true });
    expect(db.user.findMany).toHaveBeenCalledTimes(1);
  });

  it("reports failure without throwing when the database stays unreachable", async () => {
    db.$queryRaw.mockRejectedValue(new Error("syntax error"));
    await expect(runSweep()).resolves.toEqual({ ok: false });
    expect(ingest.ingestUser).not.toHaveBeenCalled();
  });
});

describe("runSweep — forwarding-only users", () => {
  // u3 signed in (name and email only) and never connected Gmail; they have
  // a forwarding token. u4 signed in and has neither, so there is nothing
  // for the sweep to do for them.
  beforeEach(() => {
    db.user.findMany.mockResolvedValue([
      { id: "u1", forwardingToken: null, accounts: [{ scope: "openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.events" }] },
      { id: "u3", forwardingToken: "f3", accounts: [{ scope: "openid email profile" }] },
      { id: "u4", forwardingToken: null, accounts: [{ scope: "openid email profile" }] },
    ]);
  });

  it("asks for everyone with a Google account or a forwarding address", async () => {
    await runSweep();
    expect(db.user.findMany.mock.calls[0][0].where).toEqual({
      OR: [{ accounts: { some: { provider: "google" } } }, { forwardingToken: { not: null } }],
    });
  });

  it("skips Gmail and the calendar for them but still runs the retry and Handshake steps", async () => {
    await expect(runSweep()).resolves.toEqual({ ok: true });

    expect(ingest.ingestUser).toHaveBeenCalledTimes(1);
    expect(ingest.ingestUser.mock.calls[0][0]).toBe("u1");
    expect(ingest.retryUnprocessed.mock.calls.map((c) => c[0])).toEqual(["u1", "u3"]);
    expect(ingest.ingestHandshake.mock.calls.map((c) => c[0])).toEqual(["u1", "u3"]);
    // refreshConflicts lists pending events per user; only the Google user gets one.
    expect(db.event.findMany).toHaveBeenCalledTimes(1);
    expect(db.event.findMany.mock.calls[0][0].where).toMatchObject({ userId: "u1" });
    // No Gmail query is built for a user who has no Gmail.
    expect(db.email.findFirst).toHaveBeenCalledTimes(1);
  });

  it("enqueues their job with gmail: false", async () => {
    process.env.INGEST_MODE = "queue";
    await runSweep();
    expect(queueAdd.mock.calls.map((c) => c[1])).toEqual([
      expect.objectContaining({ userId: "u1", gmail: true, maxResults: 250 }),
      { userId: "u3", gmail: false },
    ]);
  });
});

describe("runSweep — idle users", () => {
  const GRANT = "openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.events";
  const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

  beforeEach(() => {
    delete process.env.LUMI_PAUSE_AFTER_DAYS;
    db.user.findMany.mockResolvedValue([
      { id: "here", forwardingToken: null, lastSeenAt: daysAgo(2), accounts: [{ scope: GRANT }] },
      { id: "gone", forwardingToken: null, lastSeenAt: daysAgo(30), accounts: [{ scope: GRANT }] },
      { id: "old-row", forwardingToken: null, lastSeenAt: null, accounts: [{ scope: GRANT }] },
    ]);
  });

  it("reads mail only for people who have opened Lumi lately", async () => {
    await runSweep();
    expect(ingest.ingestUser.mock.calls.map((c) => c[0])).toEqual(["here", "old-row"]);
  });

  it("sweeps everyone when the pause is switched off", async () => {
    process.env.LUMI_PAUSE_AFTER_DAYS = "0";
    await runSweep();
    expect(ingest.ingestUser.mock.calls.map((c) => c[0])).toEqual(["here", "gone", "old-row"]);
  });
});

describe("runIngestJob", () => {
  it("runs the Gmail step unless the job says there is no Gmail", async () => {
    await runIngestJob({ userId: "u1" });
    expect(ingest.ingestUser).toHaveBeenCalledWith("u1", { query: undefined, maxResults: undefined });

    ingest.ingestUser.mockClear();
    const result = await runIngestJob({ userId: "u3", gmail: false });
    expect(ingest.ingestUser).not.toHaveBeenCalled();
    expect(ingest.retryUnprocessed).toHaveBeenCalledWith("u3");
    expect(result).toMatchObject({ fetched: 0, newEmails: 0, retry: { retried: 0, recovered: 0, eventsCreated: 0 } });
  });
});

describe("runSweep — queue mode", () => {
  it("enqueues one job per user and ingests nothing itself", async () => {
    process.env.INGEST_MODE = "queue";
    await runSweep();

    expect(queueAdd).toHaveBeenCalledTimes(2);
    expect(queueAdd.mock.calls[0][1]).toMatchObject({ userId: "u1", maxResults: 250 });
    expect(ingest.ingestUser).not.toHaveBeenCalled();
  });
});
