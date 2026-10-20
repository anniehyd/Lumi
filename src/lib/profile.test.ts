import { describe, expect, it } from "vitest";
import { DEFAULT_PROFILE, normalizeProfile, rubricFor, type UserProfile } from "@/lib/profile";

describe("normalizeProfile", () => {
  it("falls back to the default for null, so a user row without a profile still extracts", () => {
    expect(normalizeProfile(null)).toEqual(DEFAULT_PROFILE);
    expect(normalizeProfile(undefined)).toEqual(DEFAULT_PROFILE);
    expect(normalizeProfile("garbage")).toEqual(DEFAULT_PROFILE);
  });

  it("falls back when the object carries no usable signal", () => {
    expect(normalizeProfile({})).toEqual(DEFAULT_PROFILE);
    expect(normalizeProfile({ interests: [] })).toEqual(DEFAULT_PROFILE);
  });

  it("keeps a partial profile rather than discarding it", () => {
    const p = normalizeProfile({ role: "finance" });
    expect(p.role).toBe("finance");
    expect(p.interests).toEqual([]);
  });

  it("drops non-string interests instead of passing them to the prompt", () => {
    const p = normalizeProfile({ role: "cs", interests: ["Hackathons", 42, null, "Tech talks"] });
    expect(p.interests).toEqual(["Hackathons", "Tech talks"]);
  });

  it("caps the free-text note so one user cannot blow up the prompt", () => {
    const p = normalizeProfile({ role: "cs", note: "x".repeat(5000) });
    expect(p.note).toHaveLength(600);
  });

  it("caps the interest list", () => {
    const p = normalizeProfile({ role: "cs", interests: Array.from({ length: 50 }, (_, i) => `i${i}`) });
    expect(p.interests).toHaveLength(20);
  });
});

describe("rubricFor", () => {
  const finance: UserProfile = {
    role: "finance",
    school: "NYU",
    gradYear: "2028",
    interests: ["Recruiting events", "Alumni panels"],
    note: "Targeting IB summer analyst roles.",
  };

  it("names the user's own field rather than the hardcoded CS one", () => {
    const r = rubricFor(finance);
    expect(r).toContain("finance / quant");
    expect(r).toContain("NYU");
    expect(r).toContain("graduating 2028");
    expect(r).toContain("Recruiting events, Alumni panels");
    expect(r).toContain("Targeting IB summer analyst roles.");
    // The bug this whole change exists to fix.
    expect(r).not.toContain("Math + CS");
  });

  it("keeps the scale and the social floor identical across users, so scores stay comparable", () => {
    const cs = rubricFor({ role: "cs", interests: ["Hackathons"] });
    const fin = rubricFor(finance);
    for (const r of [cs, fin]) {
      expect(r).toContain("score each event 1..5");
      expect(r).toContain("Networking and social events are never below 3");
    }
  });

  it("still produces a usable rubric when the profile is nearly empty", () => {
    const r = rubricFor({ role: "other", interests: [] });
    expect(r).toContain("career events, talks, and anything where they would meet people");
    expect(r).toContain("score each event 1..5");
  });

  it("omits the quoted line entirely when there is no note", () => {
    expect(rubricFor({ role: "cs", interests: ["Hackathons"] })).not.toContain("In their own words");
  });
});
