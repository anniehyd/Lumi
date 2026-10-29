import { describe, expect, it } from "vitest";
import { countPending, pendingOf, upcomingOf } from "./pending";
import type { MockEvent } from "@/lib/mock/events";

const NOW = Date.UTC(2026, 9, 28, 12, 0, 0);
const hours = (h: number) => new Date(NOW + h * 3600_000).toISOString();

function ev(partial: Partial<MockEvent> & { id: string }): MockEvent {
  return {
    status: "PENDING",
    confidence: 0.9,
    detectedVia: "LLM",
    kind: "INFO_SESSION",
    title: partial.id,
    description: "",
    startTime: hours(72),
    relevance: 3,
    timezone: "America/New_York",
    ...partial,
  } as MockEvent;
}

describe("pendingOf", () => {
  it("keeps only undecided or maybe events that have not started", () => {
    const list = pendingOf(
      [
        ev({ id: "accepted", status: "ACCEPTED" }),
        ev({ id: "declined", status: "DECLINED" }),
        ev({ id: "past", startTime: hours(-1) }),
        ev({ id: "pending" }),
        ev({ id: "maybe", status: "MAYBE" }),
      ],
      NOW
    );
    expect(list.map((e) => e.id)).toEqual(["pending", "maybe"]);
  });

  it("puts untouched cards above Maybe cards, whatever their rating", () => {
    const list = pendingOf(
      [
        ev({ id: "maybe-5", status: "MAYBE", relevance: 5 }),
        ev({ id: "pending-2", relevance: 2 }),
        ev({ id: "pending-4", relevance: 4 }),
        ev({ id: "maybe-1", status: "MAYBE", relevance: 1 }),
      ],
      NOW
    );
    expect(list.map((e) => e.id)).toEqual(["pending-4", "pending-2", "maybe-5", "maybe-1"]);
  });

  it("floats anything inside two days above the rest, even at one star", () => {
    const list = pendingOf(
      [
        ev({ id: "friday-5", relevance: 5, startTime: hours(72) }),
        ev({ id: "tonight-1", relevance: 1, startTime: hours(8) }),
        ev({ id: "tomorrow-3", relevance: 3, startTime: hours(30) }),
        ev({ id: "maybe-soon", status: "MAYBE", relevance: 5, startTime: hours(4) }),
      ],
      NOW
    );
    expect(list.map((e) => e.id)).toEqual(["tomorrow-3", "tonight-1", "friday-5", "maybe-soon"]);
  });

  it("orders by rating, then by start time within a rating", () => {
    const list = pendingOf(
      [
        ev({ id: "later", relevance: 4, startTime: hours(96) }),
        ev({ id: "sooner", relevance: 4, startTime: hours(80) }),
        ev({ id: "top", relevance: 5, startTime: hours(120) }),
        ev({ id: "unrated", relevance: undefined, startTime: hours(60) }),
      ],
      NOW
    );
    expect(list.map((e) => e.id)).toEqual(["top", "sooner", "later", "unrated"]);
  });
});

describe("countPending", () => {
  it("splits the list into untouched and maybe", () => {
    const list = [ev({ id: "a" }), ev({ id: "b", status: "MAYBE" }), ev({ id: "c" })];
    expect(countPending(list)).toEqual({ undecided: 2, maybe: 1 });
    expect(countPending([])).toEqual({ undecided: 0, maybe: 0 });
  });
});

describe("upcomingOf", () => {
  it("lists accepted future events soonest first, capped", () => {
    const list = upcomingOf(
      [
        ev({ id: "c", status: "ACCEPTED", startTime: hours(50) }),
        ev({ id: "gone", status: "ACCEPTED", startTime: hours(-5) }),
        ev({ id: "a", status: "ACCEPTED", startTime: hours(5) }),
        ev({ id: "pending", startTime: hours(1) }),
        ev({ id: "b", status: "ACCEPTED", startTime: hours(20) }),
        ev({ id: "d", status: "ACCEPTED", startTime: hours(90) }),
      ],
      NOW,
      3
    );
    expect(list.map((e) => e.id)).toEqual(["a", "b", "c"]);
  });
});
