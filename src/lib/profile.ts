/**
 * Per-user interest profile — what Lumi should surface for this person.
 *
 * Until now the relevance rubric was hardcoded to one user ("NYU undergrad,
 * Math + CS, hunting tech internships"), which scored every finance event a 2.
 * The profile replaces that paragraph per user; everything else in the
 * extraction prompt is shared.
 *
 * Stored as JSON on User.profile. Null falls back to DEFAULT_PROFILE, so an
 * existing user whose row predates onboarding keeps working unchanged.
 */

export type UserProfile = {
  /** Broad lane, drives the default interest weighting. */
  role: string;
  school?: string;
  gradYear?: string;
  /** Chips from onboarding. */
  interests: string[];
  /**
   * Free text: "what should Lumi never let you miss?". Outperforms the chips
   * in practice — it is the only field that captures anything specific.
   */
  note?: string;
};

/** Bump when the prompt's shape changes, so Event.promptVersion stays meaningful. */
export const PROMPT_VERSION = "v2-profile";

export const ROLES = [
  { id: "cs", label: "CS / engineering" },
  { id: "finance", label: "Finance / quant" },
  { id: "design", label: "Design / product" },
  { id: "science", label: "Science / research" },
  { id: "other", label: "Something else" },
] as const;

export const INTERESTS = [
  "Internship deadlines",
  "Info sessions",
  "Recruiting events",
  "Career fairs",
  "Hackathons",
  "Tech talks",
  "Startup events",
  "Networking / mixers",
  "Research talks",
  "Workshops",
  "Club socials",
  "Alumni panels",
] as const;

/** The original hardcoded rubric, preserved as the fallback. */
export const DEFAULT_PROFILE: UserProfile = {
  role: "cs",
  school: "NYU",
  gradYear: "",
  interests: [
    "Internship deadlines",
    "Info sessions",
    "Recruiting events",
    "Hackathons",
    "Tech talks",
  ],
  note: "Hunting for tech internships — software engineering, cloud, AI/ML.",
};

export function normalizeProfile(raw: unknown): UserProfile {
  if (!raw || typeof raw !== "object") return DEFAULT_PROFILE;
  const p = raw as Partial<UserProfile>;
  const interests = Array.isArray(p.interests)
    ? p.interests.filter((i): i is string => typeof i === "string").slice(0, 20)
    : [];
  if (!p.role && interests.length === 0 && !p.note) return DEFAULT_PROFILE;
  return {
    role: typeof p.role === "string" && p.role ? p.role : "other",
    school: typeof p.school === "string" ? p.school : undefined,
    gradYear: typeof p.gradYear === "string" ? p.gradYear : undefined,
    interests,
    note: typeof p.note === "string" ? p.note.slice(0, 600) : undefined,
  };
}

function describe(p: UserProfile): string {
  const role = ROLES.find((r) => r.id === p.role)?.label ?? p.role;
  const bits = [
    p.school ? `a student at ${p.school}` : "a student",
    p.gradYear ? `graduating ${p.gradYear}` : null,
    `focused on ${role.toLowerCase()}`,
  ].filter(Boolean);
  return bits.join(", ");
}

/**
 * The user-specific half of the system prompt. The 1-5 scale and the
 * "networking is never below 3" floor stay fixed across users so relevance
 * scores remain comparable between accounts — only the subject changes.
 */
export function rubricFor(profile: UserProfile): string {
  const p = normalizeProfile(profile);
  const interests = p.interests.length
    ? p.interests.join(", ")
    : "career events, talks, and anything where they would meet people";

  return `Relevance rubric — score each event 1..5 for THIS user:
The user is ${describe(p)}.
They care most about, highest first: ${interests}.${
    p.note ? `\nIn their own words: "${p.note}"` : ""
  }

- 5: squarely one of the things they said they care about, or a deadline for one.
- 4: adjacent to those interests — same field, same career track, or an event
  where the people they want to meet would be.
- 3: general networking and social mixers where one could meet people
  (career fairs, coffee socials, student org mixers), and academic events.
- 2: career events clearly outside their field, general campus activities.
- 1: unrelated to their career or to meeting people (tourism outings,
  administrative deadlines).
Networking and social events are never below 3 unless clearly unrelated to
meeting people. Judge fit to THIS user's stated interests, not to technology
in general.`;
}
