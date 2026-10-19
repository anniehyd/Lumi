import { describe, expect, it } from "vitest";
import {
  bestTimes,
  formatRange,
  keyToDate,
  makeSlug,
  parseKey,
  sanitizeSlots,
  slotKeys,
  slotTimes,
  tally,
  validatePollInput,
} from "@/lib/meet";

const poll = {
  days: ["2026-10-20", "2026-10-21"],
  dayStart: 9 * 60,
  dayEnd: 12 * 60,
  slotMinutes: 30,
};

const r = (name: string, slots: string[]) => ({ name, slots, updatedAt: "2026-10-19T00:00:00Z" });

describe("slot keys", () => {
  it("lists the grid day by day", () => {
    const keys = slotKeys(poll);
    expect(keys).toHaveLength(12);
    expect(keys[0]).toBe("2026-10-20T09:00");
    expect(keys[5]).toBe("2026-10-20T11:30");
    expect(keys[6]).toBe("2026-10-21T09:00");
    expect(slotTimes(poll)).toEqual([540, 570, 600, 630, 660, 690]);
  });

  it("parses and rejects keys", () => {
    expect(parseKey("2026-10-20T14:30")).toEqual({ day: "2026-10-20", minutes: 870 });
    expect(parseKey("nope")).toBeNull();
  });

  it("sanitizes a painted set against the grid", () => {
    expect(sanitizeSlots(poll, ["2026-10-20T09:30", "2026-10-20T09:30", "2026-10-22T09:00", 5, "x"])).toEqual([
      "2026-10-20T09:30",
    ]);
    expect(sanitizeSlots(poll, "not an array")).toEqual([]);
  });
});

describe("tally", () => {
  it("lists who is free per slot", () => {
    const t = tally([r("Ann", ["2026-10-20T09:00"]), r("Bo", ["2026-10-20T09:00", "2026-10-20T09:30"])]);
    expect(t.get("2026-10-20T09:00")).toEqual(["Ann", "Bo"]);
    expect(t.get("2026-10-20T09:30")).toEqual(["Bo"]);
    expect(t.get("2026-10-20T10:00")).toBeUndefined();
  });
});

describe("bestTimes", () => {
  const ann = r("Ann", ["2026-10-20T09:00", "2026-10-20T09:30", "2026-10-20T10:00", "2026-10-21T11:00"]);
  const bo = r("Bo", ["2026-10-20T09:30", "2026-10-20T10:00", "2026-10-20T10:30", "2026-10-21T11:00"]);
  const cy = r("Cy", ["2026-10-20T09:30", "2026-10-20T10:00", "2026-10-21T11:30"]);

  it("puts the stretch everyone shares first, longest first", () => {
    const best = bestTimes(poll, [ann, bo, cy]);
    expect(best[0]).toMatchObject({
      day: "2026-10-20",
      start: "2026-10-20T09:30",
      end: "2026-10-20T10:30",
      count: 3,
      names: ["Ann", "Bo", "Cy"],
      missing: [],
    });
  });

  it("then shows stretches missing one person, naming who", () => {
    const best = bestTimes(poll, [ann, bo, cy]);
    const two = best.filter((b) => b.count === 2);
    expect(two.map((b) => `${b.start}-${b.end}:${b.missing.join("")}`)).toContain("2026-10-21T11:00-2026-10-21T11:30:Cy");
  });

  it("never merges two different pairs into one run", () => {
    // 9:00 Ann+Bo, 9:30 Bo+Cy: both have two people but not the same two.
    const best = bestTimes(
      poll,
      [r("Ann", ["2026-10-20T09:00"]), r("Bo", ["2026-10-20T09:00", "2026-10-20T09:30"]), r("Cy", ["2026-10-20T09:30"])],
      { minCount: 2 }
    );
    expect(best.map((b) => [b.start, b.end, b.names.join("+")])).toEqual([
      ["2026-10-20T09:00", "2026-10-20T09:30", "Ann+Bo"],
      ["2026-10-20T09:30", "2026-10-20T10:00", "Bo+Cy"],
    ]);
  });

  it("is empty with no responses and honours the limit", () => {
    expect(bestTimes(poll, [])).toEqual([]);
    expect(bestTimes(poll, [ann, bo, cy], { limit: 1 })).toHaveLength(1);
  });

  it("formats a range in plain words", () => {
    expect(formatRange({ day: "2026-10-20", start: "2026-10-20T09:30", end: "2026-10-20T10:30" })).toBe(
      "Tue, Oct 20 · 9:30 AM–10:30 AM"
    );
  });
});

describe("keyToDate", () => {
  it("turns a wall-clock key into an instant in the poll's zone", () => {
    expect(keyToDate("2026-10-20T09:00", "America/New_York").toISOString()).toBe("2026-10-20T13:00:00.000Z");
    expect(keyToDate("2026-12-20T09:00", "America/New_York").toISOString()).toBe("2026-12-20T14:00:00.000Z");
  });
});

describe("validatePollInput", () => {
  const good = { title: "Study group", days: ["2026-10-20"], dayStart: 540, dayEnd: 1260, slotMinutes: 30, timezone: "America/New_York" };
  it("accepts a sane poll", () => {
    expect(validatePollInput(good)).toBeNull();
  });
  it("rejects the obvious mistakes", () => {
    expect(validatePollInput({ ...good, title: " " })).toMatch(/title/);
    expect(validatePollInput({ ...good, days: [] })).toMatch(/day/);
    expect(validatePollInput({ ...good, dayEnd: 500 })).toMatch(/window/);
    expect(validatePollInput({ ...good, slotMinutes: 20 })).toMatch(/Slots/);
    expect(validatePollInput({ ...good, dayStart: 545 })).toMatch(/whole number/);
    expect(validatePollInput({ ...good, timezone: "Mars/Olympus" })).toMatch(/time zone/i);
  });
});

describe("makeSlug", () => {
  it("is ten lowercase url-safe characters", () => {
    expect(makeSlug()).toMatch(/^[a-z2-9]{10}$/);
    expect(makeSlug(() => 0)).toBe("aaaaaaaaaa");
  });
});
