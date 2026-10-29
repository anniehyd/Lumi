import type { EventKind, MockEvent } from "@/lib/mock/events";
import { DEFAULT_PROFILE, type UserProfile } from "@/lib/profile";

/**
 * What the stars on a card mean, spelled out. The score itself comes from the
 * model, judged against the user's interest profile (see rubricFor). This
 * turns that number, the model's one-line reason when it wrote one, and the
 * user's own interest chips into the few lines the card shows when the stars
 * are clicked.
 */
export type StarNote = {
  /** 1..5 */
  score: number;
  /** "Squarely what you asked for", "Probably not for you", … */
  headline: string;
  /** The model's line on why, in the user's terms. Absent for parser tiers. */
  reason?: string;
  /** The user's own interest chips this event counts as, in their order. */
  counts: string[];
};

const HEADLINES: Record<number, string> = {
  5: "Squarely what you asked for",
  4: "Close to what you care about",
  3: "Worth knowing about",
  2: "Probably not for you",
  1: "Not your kind of thing",
};

/** Which interest chips an event's kind implies on its own. */
const KIND_CHIPS: Record<EventKind, string[]> = {
  DEADLINE: ["Internship deadlines"],
  INFO_SESSION: ["Info sessions", "Recruiting events"],
  COFFEE_CHAT: ["Recruiting events", "Networking / mixers"],
  MEETING: [],
};

/** Chips an event's own words point at. Matched against the profile's list, so a miss costs nothing. */
const WORD_CHIPS: [RegExp, string][] = [
  [/hack(athon|day)|buildathon|build sprint/i, "Hackathons"],
  [/career fair/i, "Career fairs"],
  [/\binterns?(hips?)?\b|recruit/i, "Recruiting events"],
  [/deadline|\bdue\b|assessment|application/i, "Internship deadlines"],
  [/\b(talk|panel|fireside|lecture|keynote)\b/i, "Tech talks"],
  [/research/i, "Research talks"],
  [/startup|founder|\bseed\b|venture|\bVC\b/i, "Startup events"],
  [/mixer|networking|social|drinks|meetup/i, "Networking / mixers"],
  [/workshop|\bcrit\b|sprint/i, "Workshops"],
  [/alumni/i, "Alumni panels"],
  [/\bclub\b|\bmembers?\b/i, "Club socials"],
];

/** The user's interest chips this event counts as, judged from its kind and its words. */
export function countsAs(
  e: Pick<MockEvent, "kind" | "title" | "description" | "summary">,
  profile: UserProfile = DEFAULT_PROFILE
): string[] {
  const text = `${e.title} ${e.description ?? ""} ${e.summary ?? ""}`;
  const touched = new Set(KIND_CHIPS[e.kind] ?? []);
  for (const [re, chip] of WORD_CHIPS) if (re.test(text)) touched.add(chip);
  return profile.interests.filter((i) => touched.has(i));
}

/** Everything the star panel says about one card. */
export function starNote(
  e: Pick<MockEvent, "kind" | "title" | "description" | "summary" | "relevance" | "relevanceReason">,
  profile: UserProfile = DEFAULT_PROFILE
): StarNote {
  const score = Math.min(5, Math.max(1, Math.round(e.relevance ?? 3)));
  return {
    score,
    headline: HEADLINES[score],
    reason: e.relevanceReason?.trim() || undefined,
    counts: countsAs(e, profile),
  };
}
