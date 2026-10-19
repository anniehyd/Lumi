import { describe, expect, it } from "vitest";
import { buildBrief, shortTitle, summaryFor } from "@/lib/brief";
import type { MockEvent } from "@/lib/mock/events";

const now = new Date("2026-10-16T12:00:00-04:00");

function ev(over: Partial<MockEvent>): MockEvent {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    status: "PENDING",
    confidence: 0.95,
    detectedVia: "LLM",
    kind: "MEETING",
    title: "Something",
    description: "",
    startTime: "2026-10-18T16:00:00Z",
    timezone: "America/New_York",
    sourceEmailId: "",
    relevance: 3,
    ...over,
  };
}

describe("summaryFor", () => {
  it("names the host and the kind", () => {
    expect(
      summaryFor(ev({ kind: "COFFEE_CHAT", title: "Coffee Chats", organizerCompany: "Marshall Wace" }))
    ).toBe("A coffee chat hosted by Marshall Wace on Sunday.");
  });

  it("phrases deadlines as deadlines", () => {
    expect(summaryFor(ev({ kind: "DEADLINE", title: "Fellowship", organizerName: "NYU" }))).toBe(
      "NYU's deadline for Fellowship, due Sunday."
    );
  });

  it("flags low confidence", () => {
    expect(summaryFor(ev({ title: "Dinner", confidence: 0.5 }))).toMatch(/isn't sure it's confirmed/);
  });
});

describe("buildBrief", () => {
  it("is quiet with nothing pending", () => {
    const b = buildBrief([], now);
    expect(b.headline).toBe("Nothing new. Enjoy the quiet.");
    expect(b.emphasis).toBe("quiet");
  });

  it("calls three or more things this week a busy week", () => {
    const b = buildBrief(
      [
        ev({ kind: "COFFEE_CHAT", title: "Coffee Chats with Marshall Wace", organizerCompany: "Marshall Wace", relevance: 5 }),
        ev({ kind: "INFO_SESSION", title: "Careers in Big Law", startTime: "2026-10-19T21:00:00Z" }),
        ev({ kind: "DEADLINE", title: "Changemaker Fellowship — Deadline", startTime: "2026-10-22T03:59:00Z" }),
      ],
      now
    );
    expect(b.headline).toBe("Looks like it’s gonna be a busy week.");
    expect(b.emphasis).toBe("busy");
    expect(b.subline).toBe(
      "Two recruiting events and one deadline. If you only make one, make it Coffee Chats with Marshall Wace on Sunday."
    );
  });

  it("gets excited about networking", () => {
    const b = buildBrief(
      [
        ev({ title: "Alumni mixer", startTime: "2026-11-02T22:00:00Z" }),
        ev({ title: "Startup networking night", startTime: "2026-11-05T22:00:00Z" }),
      ],
      now
    );
    expect(b.headline).toBe("Let’s go network!");
  });

  it("points at the deadline when only deadlines are pending", () => {
    const b = buildBrief([ev({ kind: "DEADLINE", title: "Grant — apply", startTime: "2026-10-30T03:59:00Z" })], now);
    expect(b.headline).toBe("One eye on the calendar.");
    expect(b.subline).toBe("One deadline. The Grant deadline is Thursday.");
  });

  it("counts one thing as one thing", () => {
    const b = buildBrief([ev({ title: "Dinner", startTime: "2026-11-05T02:00:00Z" })], now);
    expect(b.headline).toBe("Just one thing to decide.");
    expect(b.subline).toBe("One other event.");
  });
});

describe("shortTitle", () => {
  it("drops the dashed or colon suffix", () => {
    expect(shortTitle("Changemaker Fellowship 2026 — Application Deadline")).toBe("Changemaker Fellowship 2026");
    expect(shortTitle("Weil Gotshal: Intro to Big Law")).toBe("Weil Gotshal");
    expect(shortTitle("Plain title")).toBe("Plain title");
  });
});
