import { describe, expect, it } from "vitest";
import { buildFinalIcs } from "@/lib/meetIcs";
import type { Poll } from "@/lib/meet";

const poll: Poll = {
  slug: "abc",
  title: "Algorithms study group, before the midterm",
  timezone: "America/New_York",
  days: ["2026-10-20"],
  dayStart: 540,
  dayEnd: 1260,
  slotMinutes: 30,
  finalStart: "2026-10-20T16:00",
  finalEnd: "2026-10-20T18:00",
  expected: [],
  ownerId: null,
  createdAt: "2026-10-19T00:00:00Z",
};

describe("buildFinalIcs", () => {
  it("is null while nothing is picked", () => {
    expect(buildFinalIcs({ ...poll, finalStart: null, finalEnd: null })).toBeNull();
  });

  it("writes the picked wall-clock time as UTC instants", () => {
    const ics = buildFinalIcs(poll, "https://lumi.test/meet/abc")!;
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("DTSTART:20261020T200000Z"); // 4 PM EDT
    expect(ics).toContain("DTEND:20261020T220000Z");
    expect(ics).toContain("SUMMARY:Algorithms study group\\, before the midterm");
    expect(ics).toContain("URL:https://lumi.test/meet/abc");
    expect(ics).toContain("UID:meet-abc-2026-10-20T16:00@lumi.app");
  });

  it("follows the poll's zone, not the server's", () => {
    const tokyo = buildFinalIcs({ ...poll, timezone: "Asia/Tokyo" })!;
    expect(tokyo).toContain("DTSTART:20261020T070000Z");
    const winter = buildFinalIcs({ ...poll, finalStart: "2026-12-01T16:00", finalEnd: "2026-12-01T17:00" })!;
    expect(winter).toContain("DTSTART:20261201T210000Z"); // 4 PM EST
  });
});
