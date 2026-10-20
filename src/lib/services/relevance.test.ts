import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The Anthropic SDK is replaced wholesale: no test in this file can reach the
// network, and each one decides what "the model" returns.
const create = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create };
  },
}));
vi.mock("@/lib/db", () => ({ prisma: { llmUsage: { create: vi.fn().mockResolvedValue({}) } } }));

import {
  activePromptVersion,
  clampRelevance,
  extractEventsDetailed,
  normalizeEvents,
} from "@/lib/services/extract";

const base = { title: "Info session", startTime: "2030-09-17T18:00:00-04:00", timezone: "America/New_York" };

describe("clampRelevance — the 1–5 star score", () => {
  it("keeps an in-range integer", () => {
    for (const n of [1, 2, 3, 4, 5]) expect(clampRelevance(n)).toBe(n);
  });

  it("pulls out-of-range scores to the nearest end", () => {
    expect(clampRelevance(0)).toBe(1);
    expect(clampRelevance(-3)).toBe(1);
    expect(clampRelevance(6)).toBe(5);
    expect(clampRelevance(99)).toBe(5);
  });

  it("rounds fractional scores", () => {
    expect(clampRelevance(3.4)).toBe(3);
    expect(clampRelevance(3.5)).toBe(4);
    expect(clampRelevance(4.9)).toBe(5);
  });

  it("accepts a numeric string", () => {
    expect(clampRelevance("4")).toBe(4);
  });

  it("falls back to the neutral 3 when the model gives nothing usable", () => {
    for (const v of [undefined, null, "high", NaN, Infinity, {}, []]) {
      expect(clampRelevance(v)).toBe(3);
    }
  });
});

describe("normalizeEvents", () => {
  it("scores every event independently", () => {
    const events = normalizeEvents([
      { ...base, title: "Hackathon", relevance: 5 },
      { ...base, title: "Campus tour", relevance: 1 },
      { ...base, title: "Mixer", relevance: 12 },
      { ...base, title: "Unscored" },
    ]);
    expect(events.map((e) => [e.title, e.relevance])).toEqual([
      ["Hackathon", 5],
      ["Campus tour", 1],
      ["Mixer", 5],
      ["Unscored", 3],
    ]);
  });

  it("drops events without a title or a parseable start", () => {
    const events = normalizeEvents([
      { ...base },
      { ...base, title: "   " },
      { ...base, title: undefined },
      { ...base, startTime: "next Tuesday-ish" },
      { ...base, startTime: undefined },
    ]);
    expect(events).toHaveLength(1);
  });

  it("clamps confidence to 0..1 and defaults it", () => {
    const [a, b, c] = normalizeEvents([
      { ...base, confidence: 1.7 },
      { ...base, confidence: -1 },
      { ...base },
    ]);
    expect([a.confidence, b.confidence, c.confidence]).toEqual([1, 0, 0.7]);
  });

  it("discards unparseable end times and deadlines but keeps the event", () => {
    const [e] = normalizeEvents([{ ...base, endTime: "late", rsvpDeadline: "soon" }]);
    expect(e.endTime).toBeUndefined();
    expect(e.rsvpDeadline).toBeUndefined();
  });

  it("coerces an unknown kind to MEETING", () => {
    const [a, b] = normalizeEvents([
      { ...base, kind: "DEADLINE" },
      { ...base, kind: "PARTY" as never },
    ]);
    expect(a.kind).toBe("DEADLINE");
    expect(b.kind).toBe("MEETING");
  });

  it("accepts the array JSON-encoded as a string", () => {
    expect(normalizeEvents(JSON.stringify([{ ...base, relevance: 4 }]))).toHaveLength(1);
  });

  it("returns nothing for payloads that are not a list", () => {
    for (const payload of [null, undefined, 42, "not json", { events: [] }]) {
      expect(normalizeEvents(payload)).toEqual([]);
    }
  });

  it("resolves link placeholders and refuses invented URLs", () => {
    const links = ["https://a.example/rsvp"];
    const [a, b, c] = normalizeEvents(
      [
        { ...base, rsvpLink: "[L1]" },
        { ...base, rsvpLink: "https://made-up.example" },
        { ...base, rsvpLink: "[L7]" },
      ],
      links
    );
    expect(a.rsvpLink).toBe("https://a.example/rsvp");
    expect(b.rsvpLink).toBeUndefined();
    expect(c.rsvpLink).toBeUndefined();
  });
});

describe("extractEventsDetailed (mocked model)", () => {
  const saved = { ...process.env };
  const input = {
    subject: "Fall recruiting",
    from: "Careers <careers@example.edu>",
    bodyText: "Join us Sept 17 at 6pm. RSVP: https://example.edu/rsvp?utm=abc",
    receivedAt: new Date("2030-09-01T12:00:00Z"),
  };

  const reply = (events: unknown, extra: Record<string, unknown> = {}) => ({
    stop_reason: "tool_use",
    content: [{ type: "tool_use", name: "save_events", input: { events } }],
    usage: { input_tokens: 1200, output_tokens: 150 },
    ...extra,
  });

  beforeEach(() => {
    create.mockReset();
    process.env = { ...saved, ANTHROPIC_API_KEY: "test-key", LLM_MODEL: "claude-haiku-4-5", LUMI_NO_USAGE_PERSIST: "1" };
    delete process.env.LLM_PROVIDER;
    delete process.env.LLM_COMPACT_LINKS;
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    process.env = { ...saved };
    vi.restoreAllMocks();
  });

  it("returns clamped events with usage and cost", async () => {
    create.mockResolvedValue(reply([{ ...base, relevance: 9, confidence: 0.9, kind: "INFO_SESSION", rsvpLink: "[L1]" }]));
    const result = await extractEventsDetailed(input);

    expect(result.called).toBe(true);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].relevance).toBe(5);
    expect(result.events[0].rsvpLink).toBe("https://example.edu/rsvp?utm=abc");
    expect(result.usage).toEqual({ inputTokens: 1200, outputTokens: 150 });
    // Haiku 4.5: $1/M in, $5/M out.
    expect(result.usd).toBeCloseTo(1200 / 1e6 + (150 / 1e6) * 5, 10);
  });

  it("sends the model placeholders, not URLs, and forces the tool", async () => {
    create.mockResolvedValue(reply([]));
    await extractEventsDetailed(input);

    const request = create.mock.calls[0][0];
    expect(request.model).toBe("claude-haiku-4-5");
    expect(request.tool_choice).toEqual({ type: "tool", name: "save_events" });
    expect(request.messages[0].content).toContain("RSVP: [L1]");
    expect(request.messages[0].content).not.toContain("https://");
    expect(request.system).toContain("[L1]");
    expect(activePromptVersion()).toMatch(/\+links$/);
  });

  it("sends bodies verbatim when link compaction is switched off", async () => {
    process.env.LLM_COMPACT_LINKS = "false";
    create.mockResolvedValue(reply([]));
    await extractEventsDetailed(input);

    const request = create.mock.calls[0][0];
    expect(request.messages[0].content).toContain("https://example.edu/rsvp?utm=abc");
    expect(request.system).not.toContain("[L1]");
    expect(activePromptVersion()).not.toMatch(/\+links$/);
  });

  it("puts the user's own interests and the email's year in the system prompt", async () => {
    create.mockResolvedValue(reply([]));
    await extractEventsDetailed({
      ...input,
      profile: { role: "finance", interests: ["Alumni panels"], note: "IB summer analyst" },
    });
    const { system } = create.mock.calls[0][0];
    expect(system).toContain("finance / quant");
    expect(system).toContain("Alumni panels");
    expect(system).toContain("IB summer analyst");
    expect(system).toContain("(2030)");
  });

  it("treats an empty result as zero events, still counted as a call", async () => {
    create.mockResolvedValue(reply([]));
    const result = await extractEventsDetailed(input);
    expect(result.events).toEqual([]);
    expect(result.called).toBe(true);
  });

  it("returns no events when the model answers without the tool", async () => {
    create.mockResolvedValue({ stop_reason: "end_turn", content: [{ type: "text", text: "none" }], usage: { input_tokens: 5, output_tokens: 1 } });
    const result = await extractEventsDetailed(input);
    // Billed even though it found nothing, so it must show up in the spend.
    expect(result).toMatchObject({ events: [], called: true, usage: { inputTokens: 5, outputTokens: 1 } });
  });

  it("warns when the answer was cut off by max_tokens", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    create.mockResolvedValue(reply([{ ...base, relevance: 4 }], { stop_reason: "max_tokens" }));
    const result = await extractEventsDetailed(input);
    expect(result.events).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("max_tokens"));
  });

  it("lets an API failure propagate so the email is retried, not marked empty", async () => {
    create.mockRejectedValue(Object.assign(new Error("overloaded"), { status: 529 }));
    await expect(extractEventsDetailed(input)).rejects.toThrow("overloaded");
  });

  it("defaults to Haiku 4.5 when no model is configured", async () => {
    delete process.env.LLM_MODEL;
    delete process.env.ANTHROPIC_MODEL;
    create.mockResolvedValue(reply([]));
    await extractEventsDetailed(input);
    expect(create.mock.calls[0][0].model).toBe("claude-haiku-4-5");
  });
});
