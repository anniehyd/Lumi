import { describe, expect, it } from "vitest";
import { countsAs, starNote } from "./stars";
import { DEFAULT_PROFILE, type UserProfile } from "./profile";
import { mockEvents } from "./mock/events";

const base = { kind: "MEETING" as const, title: "", description: "", summary: undefined };

describe("countsAs", () => {
  it("reads a deadline off its kind", () => {
    expect(countsAs({ ...base, kind: "DEADLINE", title: "Fellowship application" })).toEqual([
      "Internship deadlines",
    ]);
  });

  it("reads a hackathon off its words, in the profile's own order", () => {
    const e = { ...base, title: "Fall Buildathon kickoff", description: "Ship something in 48 hours." };
    expect(countsAs(e)).toEqual(["Hackathons"]);
    const p: UserProfile = { role: "cs", interests: ["Hackathons", "Workshops", "Internship deadlines"] };
    expect(countsAs({ ...e, description: "A weekend sprint; sponsor interns in the room." }, p)).toEqual([
      "Hackathons",
      "Workshops",
    ]);
  });

  it("only ever names chips the user picked", () => {
    const p: UserProfile = { role: "design", interests: ["Workshops"] };
    expect(countsAs({ ...base, kind: "INFO_SESSION", title: "Optiver Info Session" }, p)).toEqual([]);
  });

  it("is quiet for a plain meeting", () => {
    expect(countsAs({ ...base, title: "Dinner at Quince", description: "Black tie." })).toEqual([]);
  });
});

describe("starNote", () => {
  it("pairs the score with a headline and the model's reason", () => {
    const note = starNote({
      ...base,
      kind: "DEADLINE",
      title: "Assessment due",
      relevance: 5,
      relevanceReason: "An internship deadline, which you asked never to miss.",
    });
    expect(note).toEqual({
      score: 5,
      headline: "Squarely what you asked for",
      reason: "An internship deadline, which you asked never to miss.",
      counts: ["Internship deadlines"],
    });
  });

  it("treats a missing or blank reason as none, and an unrated card as three stars", () => {
    expect(starNote({ ...base, title: "x", relevance: undefined, relevanceReason: "  " })).toMatchObject({
      score: 3,
      headline: "Worth knowing about",
      reason: undefined,
    });
    expect(starNote({ ...base, title: "x", relevance: 0 }).score).toBe(1);
    expect(starNote({ ...base, title: "x", relevance: 9 }).score).toBe(5);
  });

  it("has a reason for every sample card, so the demo never shows a bare number", () => {
    for (const e of mockEvents) expect(starNote(e, DEFAULT_PROFILE).reason, e.id).toBeTruthy();
  });
});
