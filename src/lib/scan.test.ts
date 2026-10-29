import { describe, expect, it } from "vitest";
import { STALE_MS, scanState, whenLabel } from "./scan";

// Wednesday 28 Oct 2026, 10:00 New York (14:00 UTC).
const NOW = Date.UTC(2026, 9, 28, 14, 0, 0);
const TZ = "America/New_York";
const ago = (h: number) => new Date(NOW - h * 3600_000).toISOString();

describe("scanState", () => {
  it("says nothing for a user without Gmail", () => {
    expect(scanState(null, false, NOW, TZ)).toEqual({ kind: "none" });
    expect(scanState(ago(100), false, NOW, TZ)).toEqual({ kind: "none" });
  });

  it("notices Gmail that was connected but never pulled", () => {
    expect(scanState(null, true, NOW, TZ)).toEqual({ kind: "never" });
    expect(scanState("not a date", true, NOW, TZ)).toEqual({ kind: "never" });
  });

  it("is fresh for anything inside the sweep gap, including last night", () => {
    expect(scanState(ago(1), true, NOW, TZ)).toEqual({ kind: "fresh", label: "scanned at 9:00 AM" });
    expect(scanState(ago(15), true, NOW, TZ)).toEqual({ kind: "fresh", label: "scanned yesterday at 7:00 PM" });
  });

  it("goes stale once a sweep has been missed", () => {
    expect(STALE_MS).toBe(20 * 3600_000);
    expect(scanState(ago(21), true, NOW, TZ)).toEqual({ kind: "stale", label: "last scanned yesterday at 1:00 PM" });
    expect(scanState(ago(3 * 24), true, NOW, TZ)).toEqual({ kind: "stale", label: "last scanned Sunday at 10:00 AM" });
    expect(scanState(ago(16 * 24), true, NOW, TZ)).toEqual({ kind: "stale", label: "last scanned Oct 12" });
  });
});

describe("whenLabel", () => {
  it("uses the given zone for the day boundary", () => {
    // 23:30 New York on the 27th is already the 28th in UTC.
    const lateLastNight = Date.UTC(2026, 9, 28, 3, 30, 0);
    expect(whenLabel(lateLastNight, NOW, TZ)).toBe("yesterday at 11:30 PM");
    expect(whenLabel(lateLastNight, NOW, "UTC")).toBe("at 3:30 AM");
  });
});
