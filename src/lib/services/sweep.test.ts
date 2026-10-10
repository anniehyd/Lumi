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

import { ingestMode, queryFor, runSweep } from "@/lib/services/sweep";

beforeEach(() => {
  vi.resetAllMocks();
  delete process.env.INGEST_MODE;
  db.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
  db.user.findMany.mockResolvedValue([{ id: "u1" }, { id: "u2" }]);
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

describe("runSweep — queue mode", () => {
  it("enqueues one job per user and ingests nothing itself", async () => {
    process.env.INGEST_MODE = "queue";
    await runSweep();

    expect(queueAdd).toHaveBeenCalledTimes(2);
    expect(queueAdd.mock.calls[0][1]).toMatchObject({ userId: "u1", maxResults: 250 });
    expect(ingest.ingestUser).not.toHaveBeenCalled();
  });
});
