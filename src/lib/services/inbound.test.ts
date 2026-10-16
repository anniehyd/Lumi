import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The inbound-forwarding path, driven from fixtures only. Nothing here talks
 * to Postmark, Gmail, the model or the database.
 */

const db = vi.hoisted(() => ({
  email: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  user: { findUnique: vi.fn() },
}));
const gmailApi = vi.hoisted(() => ({ listMessages: vi.fn(), fetchMessage: vi.fn() }));
const pipeline = vi.hoisted(() => ({ processEmail: vi.fn(), persistEvents: vi.fn() }));
const metrics = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({ prisma: db }));
// Keep the real parser; only the Gmail API calls are stubbed.
vi.mock("@/lib/services/gmail", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/services/gmail")>()),
  ...gmailApi,
}));
vi.mock("@/lib/services/detect", () => pipeline);
vi.mock("@/lib/metrics", () => ({ recordMetrics: metrics }));

import { parseRawMessage } from "@/lib/services/gmail";
import { ingestInbound, ingestUser } from "@/lib/services/ingest";
import {
  checkInboundSecret,
  parseGmailForwardingConfirmation,
  parsePostmarkInbound,
  presentedSecret,
  recipientCandidates,
  unwrapForwarded,
  type PostmarkInbound,
} from "@/lib/services/inbound";

const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`./testdata/${name}`, import.meta.url)), "utf8");
const NEWSLETTER = fixture("forwarded-newsletter.eml");
const CONFIRMATION = fixture("gmail-forwarding-confirmation.eml");
const POSTMARK = JSON.parse(fixture("postmark-inbound.json")) as PostmarkInbound;
const TOKEN = "0123456789abcdef0123456789abcdef";
const ALIAS = `lumi+${TOKEN}@inbound.lumi.test`;

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
  process.env.INBOUND_EMAIL_DOMAIN = "inbound.lumi.test";
  db.email.findMany.mockResolvedValue([]);
  db.email.create.mockImplementation(async ({ data }) => ({ id: `row-${data.messageId}`, ...data }));
  db.email.update.mockResolvedValue({});
  pipeline.processEmail.mockResolvedValue(outcome());
  metrics.mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("secret check", () => {
  it("refuses to run without a configured secret", () => {
    expect(checkInboundSecret("anything", undefined)).toBe("unconfigured");
    expect(checkInboundSecret("anything", "  ")).toBe("unconfigured");
  });

  it("distinguishes a missing secret from a wrong one, and accepts the right one", () => {
    expect(checkInboundSecret(null, "s3cret")).toBe("missing");
    expect(checkInboundSecret("", "s3cret")).toBe("missing");
    expect(checkInboundSecret("s3cre", "s3cret")).toBe("mismatch");
    expect(checkInboundSecret("s3cret!", "s3cret")).toBe("mismatch");
    expect(checkInboundSecret("s3cret", "s3cret")).toBe("ok");
    expect(checkInboundSecret("s3cret", " s3cret\n")).toBe("ok");
  });

  it("reads the secret from basic auth (Postmark), a bearer header, or ?token=", () => {
    const basic = Buffer.from("lumi:s3cret").toString("base64");
    expect(presentedSecret(new Request("https://x/api/ingest/inbound", { headers: { authorization: `Basic ${basic}` } }))).toBe("s3cret");
    expect(presentedSecret(new Request("https://x/api/ingest/inbound", { headers: { authorization: "Bearer s3cret" } }))).toBe("s3cret");
    expect(presentedSecret(new Request("https://x/api/ingest/inbound?token=s3cret"))).toBe("s3cret");
    expect(presentedSecret(new Request("https://x/api/ingest/inbound"))).toBeNull();
    expect(presentedSecret(new Request("https://x/api/ingest/inbound", { headers: { authorization: "Basic %%%" } }))).toBeNull();
  });
});

describe("parsePostmarkInbound", () => {
  it("parses the raw message when Postmark includes it", async () => {
    const parsed = await parsePostmarkInbound({ ...POSTMARK, RawEmail: NEWSLETTER });
    expect(parsed).toMatchObject({
      messageId: "newsletter-2099-09-15@lists.nyu.edu",
      gmailId: "",
      threadId: "",
      from: '"NYU Tandon Career Services" <careers@nyu.edu>',
      subject: "Fall Tech Fair, Sept 24 at 1pm",
      hasIcs: false,
      listUnsubscribe: true,
    });
    expect(parsed.receivedAt.toISOString()).toBe("2099-09-15T12:00:00.000Z");
    expect(parsed.bodyText).toContain("Fall Tech Fair on Wednesday, September 24 at 1:00 PM");
    expect(parsed.bodyHtml).toContain("<b>Fall Tech Fair</b>");
    expect(parsed.recipients).toEqual(expect.arrayContaining(["student@nyu.edu", ALIAS]));
  });

  it("maps Postmark's pre-parsed fields when there is no raw message", async () => {
    const parsed = await parsePostmarkInbound(POSTMARK);
    expect(parsed).toMatchObject({
      messageId: "newsletter-2099-09-15@lists.nyu.edu",
      from: '"NYU Tandon Career Services" <careers@nyu.edu>',
      subject: "Fall Tech Fair, Sept 24 at 1pm",
      listUnsubscribe: true,
      hasIcs: false,
    });
    expect(parsed.receivedAt.toISOString()).toBe("2099-09-15T12:00:00.000Z");
    expect(parsed.bodyText).toBe(POSTMARK.TextBody);
  });

  it("falls back to Postmark's id when the message has no Message-ID, and finds .ics attachments", async () => {
    const ics = Buffer.from("BEGIN:VCALENDAR\nEND:VCALENDAR\n").toString("base64");
    const parsed = await parsePostmarkInbound({
      ...POSTMARK,
      Headers: [],
      Date: "garbage",
      Attachments: [{ Name: "invite.ics", Content: ics, ContentType: "text/calendar" }],
    });
    expect(parsed.messageId).toBe(POSTMARK.MessageID);
    expect(parsed.hasIcs).toBe(true);
    expect(parsed.icsContent).toContain("BEGIN:VCALENDAR");
    expect(Number.isNaN(parsed.receivedAt.getTime())).toBe(false);
  });
});

describe("recipientCandidates", () => {
  it("puts the envelope recipient first and includes headers from the raw message", async () => {
    const parsed = await parsePostmarkInbound({ ...POSTMARK, RawEmail: NEWSLETTER });
    const candidates = recipientCandidates(POSTMARK, parsed);
    expect(candidates[0]).toBe(ALIAS);
    expect(candidates).toContain("student@nyu.edu");
    // Delivered-To / X-Forwarded-To from the raw headers
    expect(candidates.filter((c) => c === ALIAS).length).toBeGreaterThan(1);
  });

  it("splits a quoted display name with a comma correctly", () => {
    const candidates = recipientCandidates({ To: `"Doe, Jane" <jane@x.test>, ${ALIAS}` });
    expect(candidates).toEqual([`"Doe, Jane" <jane@x.test>`, ALIAS]);
  });
});

describe("unwrapForwarded", () => {
  const base = {
    messageId: "m",
    threadId: "",
    gmailId: "",
    from: "Student <student@nyu.edu>",
    subject: "Fwd: Fall Tech Fair",
    receivedAt: new Date(),
    bodyHtml: "",
    hasIcs: false,
    listUnsubscribe: false,
    bodyText:
      "FYI\n\n---------- Forwarded message ---------\nFrom: NYU Careers <careers@nyu.edu>\nDate: Tue, Sep 15, 2099 at 8:00 AM\nSubject: Fall Tech Fair, Sept 24 at 1pm\nTo: <student@nyu.edu>\n\n\nJoin us on September 24.\n",
  };

  it("restores the original sender, subject and body of a hand-forwarded mail", () => {
    const out = unwrapForwarded(base);
    expect(out.from).toBe("NYU Careers <careers@nyu.edu>");
    expect(out.subject).toBe("Fall Tech Fair, Sept 24 at 1pm");
    expect(out.bodyText).toBe("Join us on September 24.\n");
  });

  it("leaves auto-forwarded mail (original headers intact) untouched", () => {
    const auto = { ...base, subject: "Fall Tech Fair", from: "careers@nyu.edu" };
    expect(unwrapForwarded(auto)).toBe(auto);
    const noBlock = { ...base, bodyText: "no block here" };
    expect(unwrapForwarded(noBlock)).toBe(noBlock);
  });
});

describe("parseGmailForwardingConfirmation", () => {
  it("pulls the code, link and requesting address out of Gmail's confirmation mail", async () => {
    const parsed = await parseRawMessage(CONFIRMATION, { fallbackMessageId: "x" });
    expect(parseGmailForwardingConfirmation(parsed)).toEqual({
      code: "987654321",
      link: "https://mail-settings.google.com/mail/vf-%5BANGjdJ8example%5D-abc123",
      forwarder: "student@nyu.edu",
    });
  });

  it("is null for ordinary mail", async () => {
    const parsed = await parseRawMessage(NEWSLETTER, { fallbackMessageId: "x" });
    expect(parseGmailForwardingConfirmation(parsed)).toBeNull();
  });
});

describe("ingestInbound", () => {
  it("stores the same Email row the Gmail path stores for the same message", async () => {
    // Gmail path: the sweep lists one id and downloads this exact raw message.
    gmailApi.listMessages.mockResolvedValue(["g1"]);
    gmailApi.fetchMessage.mockImplementation(async (_u: string, id: string) =>
      parseRawMessage(NEWSLETTER, { gmailId: id, threadId: "thread-1", fallbackMessageId: id })
    );
    await ingestUser("u1");
    const viaGmail = db.email.create.mock.calls[0][0].data;

    // Forwarding path: Postmark posts the same raw message.
    db.email.create.mockClear();
    const parsed = await parsePostmarkInbound({ ...POSTMARK, RawEmail: NEWSLETTER });
    const result = await ingestInbound("u1", parsed);
    const viaInbound = db.email.create.mock.calls[0][0].data;

    expect(result).toEqual({ stored: true, emailId: "row-newsletter-2099-09-15@lists.nyu.edu", skipped: null, eventsCreated: 0, failed: false });
    // Only the Gmail-specific identifiers differ.
    const { gmailId: g1, threadId: t1, ...gmailRest } = viaGmail;
    const { gmailId: g2, threadId: t2, ...inboundRest } = viaInbound;
    expect([g1, t1]).toEqual(["g1", "thread-1"]);
    expect([g2, t2]).toEqual([null, null]);
    expect(inboundRest).toEqual(gmailRest);
    expect(inboundRest).toMatchObject({
      userId: "u1",
      messageId: "newsletter-2099-09-15@lists.nyu.edu",
      from: '"NYU Tandon Career Services" <careers@nyu.edu>',
      processed: false,
      hasIcs: false,
      contentHash: expect.stringMatching(/^[0-9a-f]{32}$/),
    });
    // ...and detection saw the same message both times.
    const [gmailMsg, inboundMsg] = pipeline.processEmail.mock.calls.map((c) => c[2]);
    expect(inboundMsg).toEqual({ ...gmailMsg, threadId: null });
  });

  it("runs detection and records metrics once", async () => {
    pipeline.processEmail.mockResolvedValue(
      outcome({ created: 1, found: 1, tier: "LLM", llm: { called: true, inputTokens: 500, outputTokens: 40, usd: 0.001 } })
    );
    const parsed = await parsePostmarkInbound({ ...POSTMARK, RawEmail: NEWSLETTER });
    const result = await ingestInbound("u1", parsed);
    expect(result).toMatchObject({ stored: true, eventsCreated: 1, failed: false });
    expect(db.email.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ processed: true }) })
    );
    expect(metrics).toHaveBeenCalledTimes(1);
    expect(metrics).toHaveBeenCalledWith("u1", {
      emailsScanned: 1,
      emailsToModel: 1,
      eventsFound: 1,
      eventsCreated: 1,
      llmInputTokens: 500,
      llmOutputTokens: 40,
      llmUsd: 0.001,
    });
  });

  it("treats a redelivered message as a duplicate, not a new email", async () => {
    const { Prisma } = await import("@prisma/client");
    db.email.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "test" }));
    const result = await ingestInbound("u1", await parsePostmarkInbound(POSTMARK));
    expect(result).toMatchObject({ stored: false, emailId: null });
    expect(pipeline.processEmail).not.toHaveBeenCalled();
    expect(metrics).toHaveBeenCalledWith("u1", {});
  });

  it("stores a Gmail confirmation without detection, marked by its skip reason", async () => {
    const parsed = await parseRawMessage(CONFIRMATION, { fallbackMessageId: "x" });
    const result = await ingestInbound("u1", parsed, { detect: false, skipReason: "forwarding_confirmation" });
    expect(result).toMatchObject({ stored: true, skipped: "forwarding_confirmation", eventsCreated: 0, failed: false });
    expect(db.email.create.mock.calls[0][0].data).toMatchObject({ processed: true, skipReason: "forwarding_confirmation" });
    expect(pipeline.processEmail).not.toHaveBeenCalled();
  });

  it("leaves the row unprocessed for the sweep's retry when detection throws", async () => {
    pipeline.processEmail.mockRejectedValue(new Error("model overloaded"));
    const result = await ingestInbound("u1", await parsePostmarkInbound(POSTMARK));
    expect(result).toMatchObject({ stored: true, failed: true, eventsCreated: 0 });
    expect(db.email.update).toHaveBeenCalledWith({
      where: { id: "row-newsletter-2099-09-15@lists.nyu.edu" },
      data: { attempts: { increment: 1 } },
    });
  });
});
