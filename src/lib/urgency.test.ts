import { describe, expect, it } from "vitest";
import { dueChip, dueIn, isSoon } from "./urgency";

// Wednesday 2026-10-28, 10:00 in New York (14:00 UTC).
const NOW = Date.UTC(2026, 9, 28, 14, 0, 0);
const TZ = "America/New_York";
const at = (hoursFromNow: number, minutes = 0) =>
  new Date(NOW + hoursFromNow * 3600_000 + minutes * 60_000).toISOString();

describe("isSoon", () => {
  it("is true only for events ahead and inside two days", () => {
    expect(isSoon(at(-1), NOW)).toBe(false);
    expect(isSoon(at(0.5), NOW)).toBe(true);
    expect(isSoon(at(47.9), NOW)).toBe(true);
    expect(isSoon(at(48), NOW)).toBe(false);
  });
});

describe("dueIn", () => {
  it("counts minutes inside the hour", () => {
    expect(dueIn(at(0, 40), NOW, TZ)).toBe("in 40 min");
    expect(dueIn(at(0, 0.4), NOW, TZ)).toBe("in 1 min");
  });

  it("counts hours while it is still today", () => {
    expect(dueIn(at(1), NOW, TZ)).toBe("in 1 hour");
    expect(dueIn(at(6), NOW, TZ)).toBe("in 6 hours");
    // 11:59 PM New York is 13 h 59 min away and still today.
    expect(dueIn(at(13, 59), NOW, TZ)).toBe("in 14 hours");
  });

  it("says tomorrow once the event is past midnight in the event's zone", () => {
    // 1 AM New York, 15 hours away: a day word, not "in 15 hours".
    expect(dueIn(at(15), NOW, TZ)).toBe("tomorrow");
    expect(dueIn(at(36), NOW, TZ)).toBe("tomorrow");
  });

  it("says in 2 days for the far end of the window", () => {
    // 10 AM New York, two days on, 48 h away is outside; 47 h is Friday 9 AM.
    expect(dueIn(at(47), NOW, TZ)).toBe("in 2 days");
  });

  it("is null when past or beyond the window", () => {
    expect(dueIn(at(-2), NOW, TZ)).toBeNull();
    expect(dueIn(at(72), NOW, TZ)).toBeNull();
  });

  it("falls back to the machine's zone on a bad timezone", () => {
    expect(dueIn(at(6), NOW, "Not/AZone")).toMatch(/^in \d+ hours$/);
  });
});

describe("dueChip", () => {
  it("prefixes deadlines with Due and capitalises events", () => {
    expect(dueChip({ kind: "DEADLINE", startTime: at(6), timezone: TZ }, NOW)).toBe("Due in 6 hours");
    expect(dueChip({ kind: "DEADLINE", startTime: at(36), timezone: TZ }, NOW)).toBe("Due tomorrow");
    expect(dueChip({ kind: "COFFEE_CHAT", startTime: at(36), timezone: TZ }, NOW)).toBe("Tomorrow");
    expect(dueChip({ kind: "INFO_SESSION", startTime: at(6), timezone: TZ }, NOW)).toBe("In 6 hours");
    expect(dueChip({ kind: "INFO_SESSION", startTime: at(100), timezone: TZ }, NOW)).toBeNull();
  });
});
