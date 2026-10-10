import { describe, expect, it } from "vitest";
import { classifyKeyword } from "@/lib/detection/keyword";

describe("classifyKeyword", () => {
  it("passes an explicit invitation", () => {
    const v = classifyKeyword("You're invited: Fall Mixer", "Join us Thursday at 6pm. RSVP below.");
    expect(v.hit).toBe(true);
    expect(v.matches).toEqual(expect.arrayContaining(["you're invited", "join us", "rsvp"]));
  });

  it("matches on the subject alone", () => {
    expect(classifyKeyword("Info session tomorrow", "").hit).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(classifyKeyword("SAVE THE DATE", "").hit).toBe(true);
  });

  it("treats deadlines as event-bearing", () => {
    expect(classifyKeyword("Fellowship", "Application deadline: Oct 3").hit).toBe(true);
    expect(classifyKeyword("Fellowship", "Apply by Friday").hit).toBe(true);
  });

  it("rejects mail with no event language", () => {
    const v = classifyKeyword("Your statement is ready", "View your September statement online.");
    expect(v).toEqual({ hit: false, score: 0, matches: [] });
  });

  it("rejects transactional mail even when an event word slips in", () => {
    const v = classifyKeyword(
      "Order confirmation",
      "Your receipt is attached. Join us again soon!"
    );
    expect(v.hit).toBe(false);
  });

  it("does not let a single negative phrase veto a real invitation", () => {
    const v = classifyKeyword("Dinner RSVP", "Please RSVP. Keep this receipt for entry.");
    expect(v.hit).toBe(true);
  });

  it("scores by number of matches and caps at 1", () => {
    expect(classifyKeyword("rsvp", "").score).toBeCloseTo(0.3);
    expect(classifyKeyword("rsvp invite", "join us for a reception and networking happy hour").score).toBe(1);
  });
});
