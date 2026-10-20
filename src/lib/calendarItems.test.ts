import { describe, expect, it } from "vitest";
import { categorizeEvent, categorizeTitle, demoGoogleCalendar, mergeItems, type CalendarItem } from "@/lib/calendarItems";
import type { MockEvent } from "@/lib/mock/events";

function ev(over: Partial<MockEvent>): MockEvent {
  return {
    id: "e1",
    status: "ACCEPTED",
    confidence: 1,
    detectedVia: "LLM",
    kind: "MEETING",
    title: "Something",
    description: "",
    startTime: "2026-10-21T16:00:00.000Z",
    timezone: "America/New_York",
    sourceEmailId: "",
    ...over,
  };
}

describe("categorizeTitle", () => {
  it("reads classes, coffee and personal time from the title", () => {
    expect(categorizeTitle("CS-UA 310 Algorithms")).toBe("class");
    expect(categorizeTitle("Linear Algebra Recitation")).toBe("class");
    expect(categorizeTitle("Coffee chat with Priya")).toBe("coffee");
    expect(categorizeTitle("Yoga at 404")).toBe("personal");
    expect(categorizeTitle("Flight to Boston")).toBe("other");
  });
  it("keeps Lumi deadlines red and everything else ink", () => {
    expect(categorizeEvent({ kind: "DEADLINE" })).toBe("deadline");
    expect(categorizeEvent({ kind: "COFFEE_CHAT" })).toBe("lumi");
  });
});

describe("mergeItems", () => {
  const google: CalendarItem[] = [
    { id: "g1", title: "Coffee Chats with Marshall Wace", start: "2026-10-21T16:00:00.000Z", end: "2026-10-21T18:00:00.000Z", category: "coffee", source: "google" },
    { id: "g2", title: "Yoga at 404", start: "2026-10-20T11:30:00.000Z", end: "2026-10-20T12:30:00.000Z", category: "personal", source: "google" },
  ];

  it("drops the Google copy of an event accepted in Lumi", () => {
    const merged = mergeItems(google, [ev({ id: "mw", title: "Coffee Chats with Marshall Wace", startTime: "2026-10-21T16:00:00.000Z" })]);
    expect(merged.map((i) => i.id)).toEqual(["g2", "lumi-mw"]);
    expect(merged[1]).toMatchObject({ source: "lumi", category: "lumi", eventId: "mw" });
  });

  it("keeps Google entries that only look similar at another time", () => {
    const merged = mergeItems(google, [ev({ id: "mw", title: "Coffee Chats with Marshall Wace", startTime: "2026-10-28T16:00:00.000Z" })]);
    expect(merged).toHaveLength(3);
  });

  it("gives an end to a Lumi event that has none", () => {
    const [item] = mergeItems([], [ev({ startTime: "2026-10-21T16:00:00.000Z", endTime: undefined })]);
    expect(item.end).toBe("2026-10-21T17:00:00.000Z");
  });
});

describe("demoGoogleCalendar", () => {
  it("fills six weeks with about four things a week and no one-off repeats", () => {
    const items = demoGoogleCalendar(new Date("2026-10-19T12:00:00-04:00"));
    expect(items.length).toBe(6 * 4 + 2);
    expect(items.filter((i) => i.category === "coffee")).toHaveLength(2);
    expect(items.every((i) => new Date(i.end) > new Date(i.start))).toBe(true);
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
  });
});
