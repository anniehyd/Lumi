import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  email: { count: vi.fn(), findFirst: vi.fn() },
  senderStat: { findUnique: vi.fn(), update: vi.fn(), upsert: vi.fn() },
  user: { findUnique: vi.fn() },
  event: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
}));
const extract = vi.hoisted(() => vi.fn());
const calendarWindow = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/services/calendar", () => ({
  listCalendarWindow: calendarWindow,
  findConflict: (busy: { title: string; start: Date; end: Date }[], start: Date, end: Date) =>
    busy.find((b) => b.start < end && b.end > start)?.title ?? null,
}));
vi.mock("@/lib/services/extract", async (original) => ({
  ...(await original<typeof import("@/lib/services/extract")>()),
  extractEventsDetailed: extract,
  activeModel: () => "test-model",
  activePromptVersion: () => "test-prompt",
}));

import { dedupHash, persistEvents, processEmail, titleSimilarity } from "@/lib/services/detect";
import type { ExtractedEvent } from "@/lib/detection/types";

const FUTURE = "2099-09-17T22:00:00.000Z";

const event = (over: Partial<ExtractedEvent> = {}): ExtractedEvent => ({
  title: "Cloud Engineering Info Session",
  description: "Meet the team.",
  startTime: FUTURE,
  timezone: "America/New_York",
  confidence: 0.9,
  kind: "INFO_SESSION",
  relevance: 5,
  ...over,
});

const message = (over: Record<string, unknown> = {}) => ({
  subject: "You're invited: info session",
  from: "Careers <careers@example.edu>",
  bodyText: "Join us Sept 17 at 6pm in Kimmel 405.",
  bodyHtml: "",
  receivedAt: new Date("2099-09-01T12:00:00Z"),
  ...over,
});

const llmResult = (events: ExtractedEvent[]) => ({
  events,
  called: true,
  usage: { inputTokens: 1000, outputTokens: 100 },
  usd: 0.0015,
});

beforeEach(() => {
  vi.resetAllMocks();
  db.email.count.mockResolvedValue(0);
  db.email.findFirst.mockResolvedValue(null);
  db.senderStat.findUnique.mockResolvedValue(null);
  db.senderStat.update.mockResolvedValue({});
  db.senderStat.upsert.mockResolvedValue({});
  db.user.findUnique.mockResolvedValue({ profile: null });
  db.event.findUnique.mockResolvedValue(null);
  db.event.findFirst.mockResolvedValue(null);
  db.event.findMany.mockResolvedValue([]);
  db.event.create.mockResolvedValue({});
  calendarWindow.mockResolvedValue(null);
  extract.mockResolvedValue(llmResult([]));
  delete process.env.PREFILTER_SENDER_HISTORY;
});

describe("processEmail — tier order", () => {
  it("tier 1: an ICS attachment is parsed without a model call", async () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:abc",
      "DTSTART:20990917T220000Z",
      "SUMMARY:Board meeting",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const result = await processEmail("u1", "e1", message({ icsContent: ics }));

    expect(result).toMatchObject({ tier: "ICS", found: 1, created: 1, skip: null });
    expect(result.llm.called).toBe(false);
    expect(extract).not.toHaveBeenCalled();
    expect(db.event.create.mock.calls[0][0].data).toMatchObject({ detectedVia: "ICS", sourceUid: "abc" });
  });

  it("tier 2: schema.org markup is parsed without a model call", async () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@type": "Event",
      name: "Fall Hackathon",
      startDate: FUTURE,
    })}</script>`;
    const result = await processEmail("u1", "e1", message({ bodyHtml: html }));

    expect(result).toMatchObject({ tier: "SCHEMA_ORG", found: 1, created: 1 });
    expect(extract).not.toHaveBeenCalled();
  });

  it("tier 3: mail without event language stops at the keyword gate", async () => {
    const result = await processEmail(
      "u1",
      "e1",
      message({ subject: "Your statement", bodyText: "Your September statement is ready." })
    );
    expect(result).toMatchObject({ skip: "keyword", tier: null, created: 0 });
    expect(extract).not.toHaveBeenCalled();
  });

  it("tier 4: everything else that passes the filters goes to the model", async () => {
    extract.mockResolvedValue(llmResult([event()]));
    const result = await processEmail("u1", "e1", message());

    expect(result).toMatchObject({ tier: "LLM", found: 1, created: 1, skip: null });
    expect(result.llm).toEqual({ called: true, inputTokens: 1000, outputTokens: 100, usd: 0.0015 });
    expect(db.event.create.mock.calls[0][0].data).toMatchObject({
      detectedVia: "LLM",
      extractedBy: "test-model",
      promptVersion: "test-prompt",
      relevance: 5,
    });
  });

  it("falls through to the model when an ICS attachment holds no events", async () => {
    extract.mockResolvedValue(llmResult([event()]));
    const result = await processEmail("u1", "e1", message({ icsContent: "BEGIN:VCALENDAR\r\nEND:VCALENDAR" }));
    expect(result.tier).toBe("LLM");
  });

  it("passes the user's stored profile to the model", async () => {
    db.user.findUnique.mockResolvedValue({ profile: { role: "finance", interests: ["Alumni panels"] } });
    await processEmail("u1", "e1", message());
    expect(extract.mock.calls[0][0].profile).toMatchObject({ role: "finance", interests: ["Alumni panels"] });
  });
});

describe("processEmail — pre-filter skips", () => {
  it("skips survey subjects", async () => {
    const result = await processEmail(
      "u1",
      "e1",
      message({ subject: "Help us improve — you're invited to a survey" })
    );
    expect(result.skip).toBe("survey");
    expect(extract).not.toHaveBeenCalled();
  });

  it("skips mail with no date or time", async () => {
    const result = await processEmail(
      "u1",
      "e1",
      message({ subject: "You're invited", bodyText: "Refer a friend and get rewarded." })
    );
    expect(result.skip).toBe("no_temporal");
  });

  it("skips content this user has already had processed", async () => {
    db.email.findFirst.mockResolvedValue({ id: "earlier" });
    const result = await processEmail("u1", "e1", message());
    expect(result.skip).toBe("duplicate");
    expect(extract).not.toHaveBeenCalled();
  });

  it("skips a reply that adds nothing to a thread already seen", async () => {
    db.email.count.mockResolvedValue(1);
    const body = "Thanks, see you there!\n\nOn Mon, Sep 1, 2099 Sam <s@x.com> wrote:\n> Join us Sept 17 at 6pm. RSVP.";
    const result = await processEmail(
      "u1",
      "e2",
      message({ subject: "Re: You're invited: info session", bodyText: body, threadId: "t1" })
    );
    expect(result.skip).toBe("unchanged_thread");
  });

  it("still reads a reply that announces something new", async () => {
    db.email.count.mockResolvedValue(1);
    const body = "Change of plan — please join us Sept 18 at 7pm instead.\n\nOn Mon Sam <s@x.com> wrote:\n> old";
    const result = await processEmail(
      "u1",
      "e2",
      message({ subject: "Re: info session", bodyText: body, threadId: "t1" })
    );
    expect(result.skip).toBeNull();
    expect(extract).toHaveBeenCalled();
  });

  it("reads a reply in full when the thread's first message was never ingested", async () => {
    db.email.count.mockResolvedValue(0);
    const body = "ok!\n\nOn Mon Sam <s@x.com> wrote:\n> Join us Sept 17 at 6pm. RSVP.";
    const result = await processEmail(
      "u1",
      "e2",
      message({ subject: "Re: info session", bodyText: body, threadId: "t1" })
    );
    expect(result.skip).toBeNull();
  });

  it("mutes a bulk sender that has never produced an event", async () => {
    db.senderStat.findUnique.mockResolvedValue({ llmCalls: 5, eventsFound: 0, skippedSinceProbe: 0 });
    const result = await processEmail(
      "u1",
      "e1",
      message({ bodyText: "Join us Sept 17 at 6pm.\nUnsubscribe here." })
    );
    expect(result.skip).toBe("sender_history");
    expect(db.senderStat.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { skippedSinceProbe: { increment: 1 } } })
    );
    expect(extract).not.toHaveBeenCalled();
  });

  it("never mutes a person, whatever their history", async () => {
    db.senderStat.findUnique.mockResolvedValue({ llmCalls: 50, eventsFound: 0, skippedSinceProbe: 0 });
    const result = await processEmail("u1", "e1", message());
    expect(result.skip).toBeNull();
    expect(extract).toHaveBeenCalled();
  });

  it("does not mute when the rule is switched off", async () => {
    process.env.PREFILTER_SENDER_HISTORY = "false";
    db.senderStat.findUnique.mockResolvedValue({ llmCalls: 5, eventsFound: 0, skippedSinceProbe: 0 });
    const result = await processEmail("u1", "e1", message({ bodyText: "Join us Sept 17 at 6pm. Unsubscribe." }));
    expect(result.skip).toBeNull();
    expect(db.senderStat.findUnique).not.toHaveBeenCalled();
  });

  it("records each model call against the sender", async () => {
    extract.mockResolvedValue(llmResult([event(), event({ title: "Second" })]));
    await processEmail("u1", "e1", message());
    expect(db.senderStat.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_sender: { userId: "u1", sender: "careers@example.edu" } },
        create: expect.objectContaining({ llmCalls: 1, eventsFound: 2 }),
      })
    );
  });
});

describe("persistEvents — relevance scoring", () => {
  const stored = () => db.event.create.mock.calls.map((c) => c[0].data.relevance);

  it("stores the model's score", async () => {
    await persistEvents("u1", "e1", [event({ relevance: 4 })], "LLM");
    expect(stored()).toEqual([4]);
  });

  it("clamps and rounds whatever arrives", async () => {
    await persistEvents(
      "u1",
      "e1",
      [
        event({ title: "A", relevance: 0, startTime: "2099-01-01T10:00:00Z" }),
        event({ title: "B", relevance: 11, startTime: "2099-01-02T10:00:00Z" }),
        event({ title: "C", relevance: 2.6, startTime: "2099-01-03T10:00:00Z" }),
      ],
      "LLM"
    );
    expect(stored()).toEqual([1, 5, 3]);
  });

  it("gives parser-tier events, which carry no score, the neutral 3", async () => {
    await persistEvents("u1", null, [event({ relevance: undefined })], "ICS", "HANDSHAKE");
    expect(stored()).toEqual([3]);
  });

  it("never drops a low-relevance event — it is ranked, not deleted", async () => {
    const created = await persistEvents("u1", "e1", [event({ relevance: 1 })], "LLM");
    expect(created).toBe(1);
  });
});

describe("persistEvents — guards", () => {
  it("skips past events", async () => {
    const created = await persistEvents("u1", "e1", [event({ startTime: "2001-01-01T10:00:00Z" })], "LLM");
    expect(created).toBe(0);
    expect(db.event.create).not.toHaveBeenCalled();
  });

  it("skips events whose start does not parse", async () => {
    expect(await persistEvents("u1", "e1", [event({ startTime: "soon" })], "LLM")).toBe(0);
  });

  it("drops an unparseable or backwards end time without failing the insert", async () => {
    await persistEvents(
      "u1",
      "e1",
      [
        event({ title: "A", endTime: "whenever" }),
        event({ title: "B", startTime: "2099-02-01T10:00:00Z", endTime: "2099-02-01T09:00:00Z" }),
      ],
      "LLM"
    );
    expect(db.event.create.mock.calls.map((c) => c[0].data.endTime)).toEqual([null, null]);
  });

  it("skips survey and feedback 'events'", async () => {
    expect(await persistEvents("u1", "e1", [event({ title: "Dining feedback survey closes" })], "LLM")).toBe(0);
  });

  it("skips a feed event whose upstream id is already stored", async () => {
    db.event.findUnique.mockResolvedValue({ id: "existing" });
    expect(await persistEvents("u1", null, [event({ sourceUid: "handshake:1" })], "ICS", "HANDSHAKE")).toBe(0);
  });

  it("skips an exact duplicate (title + day + organizer)", async () => {
    db.event.findFirst.mockResolvedValue({ id: "existing" });
    expect(await persistEvents("u1", "e1", [event()], "LLM")).toBe(0);
  });

  it("skips the same event announced by a second sender under a similar title", async () => {
    db.event.findMany.mockResolvedValue([{ title: "Info Session: Cloud Engineering at NYU" }]);
    expect(await persistEvents("u1", "e1", [event()], "LLM")).toBe(0);
  });

  it("keeps a different event in the same time slot", async () => {
    db.event.findMany.mockResolvedValue([{ title: "Chess club social" }]);
    expect(await persistEvents("u1", "e1", [event()], "LLM")).toBe(1);
  });

  it("flags a calendar conflict without blocking the event", async () => {
    calendarWindow.mockResolvedValue([
      { title: "Linear Algebra", start: new Date("2099-09-17T21:30:00Z"), end: new Date("2099-09-17T22:30:00Z") },
    ]);
    const created = await persistEvents("u1", "e1", [event()], "LLM");
    expect(created).toBe(1);
    expect(db.event.create.mock.calls[0][0].data.conflictTitle).toBe("Linear Algebra");
  });

  it("stores no conflict when the calendar is unavailable", async () => {
    calendarWindow.mockResolvedValue(null);
    await persistEvents("u1", "e1", [event()], "LLM");
    expect(db.event.create.mock.calls[0][0].data.conflictTitle).toBeNull();
  });
});

describe("dedup helpers", () => {
  it("titleSimilarity is high for reworded titles and low for unrelated ones", () => {
    expect(titleSimilarity("Cloud Engineering Info Session", "Info Session: Cloud Engineering @ NYU")).toBe(1);
    expect(titleSimilarity("Cloud Engineering Info Session", "Chess club social")).toBe(0);
    expect(titleSimilarity("", "anything")).toBe(0);
  });

  it("dedupHash ignores case and whitespace but not the day or organizer", () => {
    const day = new Date(FUTURE);
    const a = dedupHash("Fall Mixer", day, "ACM");
    expect(dedupHash("  fall mixer ", day, "acm")).toBe(a);
    expect(dedupHash("Fall Mixer", new Date("2099-09-18T22:00:00Z"), "ACM")).not.toBe(a);
    expect(dedupHash("Fall Mixer", day, "IEEE")).not.toBe(a);
  });
});
