import { describe, expect, it } from "vitest";
import { addCalendarDays, allDayDate, localDate, parseInTimeZone, validTimeZone } from "@/lib/zonedTime";

describe("parseInTimeZone", () => {
  it("reads a wall-clock time with no offset in the given zone, not the server's", () => {
    // 6 PM in New York in November is 23:00 UTC.
    expect(parseInTimeZone("2026-11-05T18:00:00", "America/New_York")?.at.toISOString()).toBe("2026-11-05T23:00:00.000Z");
    expect(parseInTimeZone("2026-11-05 18:00", "America/Los_Angeles")?.at.toISOString()).toBe("2026-11-06T02:00:00.000Z");
  });

  it("follows daylight saving: the same clock time is a different instant in July", () => {
    expect(parseInTimeZone("2026-07-05T18:00:00", "America/New_York")?.at.toISOString()).toBe("2026-07-05T22:00:00.000Z");
  });

  it("respects an explicit offset or Z as given", () => {
    expect(parseInTimeZone("2026-11-05T18:00:00-05:00", "Asia/Tokyo")?.at.toISOString()).toBe("2026-11-05T23:00:00.000Z");
    expect(parseInTimeZone("2026-11-05T23:00:00Z", "America/New_York")?.at.toISOString()).toBe("2026-11-05T23:00:00.000Z");
  });

  it("treats a bare date as all day, starting at local midnight", () => {
    const parsed = parseInTimeZone("2026-11-05", "America/New_York");
    expect(parsed?.dateOnly).toBe(true);
    expect(parsed?.at.toISOString()).toBe("2026-11-05T05:00:00.000Z");
  });

  it("returns null for nothing or nonsense", () => {
    expect(parseInTimeZone("", "America/New_York")).toBeNull();
    expect(parseInTimeZone("next Thursday-ish", "America/New_York")).toBeNull();
  });

  it("falls back to New York for an empty or unknown zone", () => {
    expect(validTimeZone("")).toBe("America/New_York");
    expect(validTimeZone("Mars/Olympus_Mons")).toBe("America/New_York");
    expect(parseInTimeZone("2026-11-05T18:00", "Not/AZone")?.at.toISOString()).toBe("2026-11-05T23:00:00.000Z");
  });
});

describe("calendar dates", () => {
  it("names the local date of an instant, not the UTC date", () => {
    // 11 PM in New York is already the next day in UTC.
    expect(localDate(new Date("2026-11-06T04:00:00Z"), "America/New_York")).toBe("2026-11-05");
  });

  it("adds days across month and year ends", () => {
    expect(addCalendarDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addCalendarDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("labels an all-day event on its own date wherever the viewer is", () => {
    expect(allDayDate("2026-11-05T05:00:00.000Z", "America/New_York")).toBe("Thu, Nov 5");
  });
});
