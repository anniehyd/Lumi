import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const db = vi.hoisted(() => ({
  email: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  user: { findUnique: vi.fn() },
}));
const gmail = vi.hoisted(() => ({ listMessages: vi.fn(), fetchMessage: vi.fn() }));
const pipeline = vi.hoisted(() => ({ processEmail: vi.fn(), persistEvents: vi.fn() }));
const metrics = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/services/gmail", () => gmail);
vi.mock("@/lib/services/detect", () => pipeline);
vi.mock("@/lib/metrics", () => ({ recordMetrics: metrics }));

import { MAX_ATTEMPTS, ingestUser, retryUnprocessed } from "@/lib/services/ingest";

// Fixture mail only — nothing in this file talks to Gmail.
const parsed = (gmailId: string, over: Record<string, unknown> = {}) => ({
  messageId: `${gmailId}@mail.example`,
  threadId: `t-${gmailId}`,
  gmailId,
  from: "Careers <careers@example.edu>",
  subject: `Subject ${gmailId}`,
  receivedAt: new Date("2099-09-01T12:00:00Z"),
  bodyText: "Join us Sept 17 at 6pm.",
  bodyHtml: "",
  hasIcs: false,
  listUnsubscribe: false,
  ...over,
});

const outcome = (over: Record<string, unknown> = {}) => ({
  created: 0,
  found: 0,
  tier: null,
  skip: null,
  llm: { called: false, inputTokens: 0, outputTokens: 0, usd: 0 },
  ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  db.email.findMany.mockResolvedValue([]);
  db.email.create.mockImplementation(async ({ data }) => ({ id: `row-${data.gmailId}`, ...data }));
  db.email.update.mockResolvedValue({});
  gmail.fetchMessage.mockImplementation(async (_user: string, id: string) => parsed(id));
  pipeline.processEmail.mockResolvedValue(outcome());
  metrics.mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("ingestUser", () => {
  it("stores each new message and runs detection on it", async () => {
    gmail.listMessages.mockResolvedValue(["a", "b"]);
    pipeline.processEmail
      .mockResolvedValueOnce(outcome({ created: 2, found: 3, tier: "LLM", llm: { called: true, inputTokens: 900, outputTokens: 80, usd: 0.0013 } }))
      .mockResolvedValueOnce(outcome({ skip: "keyword" }));

    const result = await ingestUser("u1");

    expect(result).toEqual({ fetched: 2, newEmails: 2, skipped: 1, sentToModel: 1, eventsCreated: 2, failed: 0 });
    expect(db.email.create).toHaveBeenCalledTimes(2);
    expect(db.email.create.mock.calls[0][0].data).toMatchObject({
      userId: "u1",
      gmailId: "a",
      processed: false,
      contentHash: expect.stringMatching(/^[0-9a-f]{32}$/),
    });
    expect(db.email.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ processed: true, skipReason: "keyword" }) })
    );
  });

  it("writes the funnel counters once per run", async () => {
    gmail.listMessages.mockResolvedValue(["a", "b", "c"]);
    pipeline.processEmail
      .mockResolvedValueOnce(outcome({ created: 1, found: 1, tier: "LLM", llm: { called: true, inputTokens: 1000, outputTokens: 100, usd: 0.002 } }))
      .mockResolvedValueOnce(outcome({ skip: "no_temporal" }))
      .mockResolvedValueOnce(outcome({ created: 1, found: 1, tier: "ICS" }));

    await ingestUser("u1");

    expect(metrics).toHaveBeenCalledTimes(1);
    expect(metrics).toHaveBeenCalledWith("u1", {
      emailsScanned: 3,
      emailsSkipped: 1,
      emailsToModel: 1,
      eventsFound: 2,
      eventsCreated: 2,
      llmInputTokens: 1000,
      llmOutputTokens: 100,
      llmUsd: 0.002,
    });
  });

  it("does not download mail it has already ingested", async () => {
    gmail.listMessages.mockResolvedValue(["old", "new"]);
    db.email.findMany.mockResolvedValue([{ gmailId: "old" }]);

    const result = await ingestUser("u1");

    expect(gmail.fetchMessage).toHaveBeenCalledTimes(1);
    expect(gmail.fetchMessage).toHaveBeenCalledWith("u1", "new");
    expect(result).toMatchObject({ fetched: 2, newEmails: 1 });
  });

  it("treats a unique-key collision as already ingested", async () => {
    gmail.listMessages.mockResolvedValue(["a"]);
    db.email.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "test" })
    );

    const result = await ingestUser("u1");

    expect(result.newEmails).toBe(0);
    expect(pipeline.processEmail).not.toHaveBeenCalled();
  });

  it("keeps going when one message fails to download", async () => {
    gmail.listMessages.mockResolvedValue(["bad", "good"]);
    gmail.fetchMessage.mockRejectedValueOnce(new Error("gmail 503")).mockResolvedValueOnce(parsed("good"));

    const result = await ingestUser("u1");

    expect(result).toMatchObject({ newEmails: 1, failed: 1 });
  });

  it("leaves an email unprocessed, with an attempt recorded, when detection throws", async () => {
    gmail.listMessages.mockResolvedValue(["a", "b"]);
    pipeline.processEmail.mockRejectedValueOnce(new Error("model overloaded")).mockResolvedValueOnce(outcome());

    const result = await ingestUser("u1");

    expect(result).toMatchObject({ newEmails: 2, failed: 1 });
    expect(db.email.update).toHaveBeenCalledWith({ where: { id: "row-a" }, data: { attempts: { increment: 1 } } });
    expect(db.email.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "row-b" }, data: expect.objectContaining({ processed: true }) })
    );
  });

  it("forwards the query and the list-unsubscribe signal", async () => {
    gmail.listMessages.mockResolvedValue(["a"]);
    gmail.fetchMessage.mockResolvedValue(parsed("a", { listUnsubscribe: true }));

    await ingestUser("u1", { query: "after:123 in:inbox", maxResults: 250 });

    expect(gmail.listMessages).toHaveBeenCalledWith("u1", { query: "after:123 in:inbox", maxResults: 250 });
    expect(pipeline.processEmail.mock.calls[0][2]).toMatchObject({ listUnsubscribe: true, threadId: "t-a" });
  });

  it("does nothing, and writes no metrics, for an empty inbox", async () => {
    gmail.listMessages.mockResolvedValue([]);
    const result = await ingestUser("u1");
    expect(result).toEqual({ fetched: 0, newEmails: 0, skipped: 0, sentToModel: 0, eventsCreated: 0, failed: 0 });
    expect(db.email.findMany).not.toHaveBeenCalled();
    expect(metrics).toHaveBeenCalledWith("u1", {});
  });
});

describe("retryUnprocessed", () => {
  const stored = (id: string) => ({
    id,
    bodyText: "Join us Sept 17 at 6pm.",
    bodyHtml: "",
    subject: "Invite",
    from: "a@b.com",
    receivedAt: new Date("2099-09-01T12:00:00Z"),
    threadId: null,
  });

  it("re-runs detection from the stored body, without calling Gmail", async () => {
    db.email.findMany.mockResolvedValue([stored("x")]);
    pipeline.processEmail.mockResolvedValue(outcome({ created: 1, found: 1, tier: "LLM", llm: { called: true, inputTokens: 500, outputTokens: 50, usd: 0.001 } }));

    const result = await retryUnprocessed("u1");

    expect(result).toEqual({ retried: 1, recovered: 1, eventsCreated: 1 });
    expect(gmail.fetchMessage).not.toHaveBeenCalled();
    expect(db.email.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "x" }, data: expect.objectContaining({ processed: true }) })
    );
  });

  it("only picks up emails still under the attempt cap", async () => {
    db.email.findMany.mockResolvedValue([]);
    await retryUnprocessed("u1");
    expect(db.email.findMany.mock.calls[0][0].where).toMatchObject({
      userId: "u1",
      processed: false,
      attempts: { lt: MAX_ATTEMPTS },
    });
  });

  it("counts a second failure and moves on", async () => {
    db.email.findMany.mockResolvedValue([stored("x"), stored("y")]);
    pipeline.processEmail.mockRejectedValueOnce(new Error("still down")).mockResolvedValueOnce(outcome());

    const result = await retryUnprocessed("u1");

    expect(result).toMatchObject({ retried: 2, recovered: 1 });
    expect(db.email.update).toHaveBeenCalledWith({ where: { id: "x" }, data: { attempts: { increment: 1 } } });
  });
});
