import type { MockEvent } from "@/lib/mock/events";

/**
 * The two sentences the dashboard leads with.
 *
 * `summaryFor` is the per-event one-liner (what the event is). The model
 * writes one in the extraction call; events from the parser tiers and the
 * Handshake feed, and older rows, get this template instead so no card is
 * ever blank.
 *
 * `buildBrief` is the headline over the whole list ("Looks like it's gonna be
 * a busy week."). It is rule-based on purpose: it costs nothing, it is the
 * same for the same inbox, and it can be tested without a model.
 */

type Summarizable = Pick<
  MockEvent,
  "title" | "kind" | "organizerCompany" | "organizerName" | "startTime" | "confidence" | "timezone"
>;

/** The weekday where the event happens, not where the server runs. */
function weekday(iso: string, timeZone?: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", { weekday: "long", timeZone });
  } catch {
    return new Date(iso).toLocaleDateString("en-US", { weekday: "long" });
  }
}

export function summaryFor(e: Summarizable): string {
  const host = e.organizerCompany ?? e.organizerName;
  const day = weekday(e.startTime, e.timezone);
  if (e.kind === "DEADLINE") {
    return host ? `${host}'s deadline for ${e.title}, due ${day}.` : `A deadline, ${e.title}, due ${day}.`;
  }
  const what =
    e.kind === "COFFEE_CHAT" ? "A coffee chat" : e.kind === "INFO_SESSION" ? "An info session" : "An event";
  const lead = host ? `${what} hosted by ${host}` : what;
  const tail = e.confidence < 0.7 ? ". Lumi isn't sure it's confirmed." : ".";
  return `${lead} on ${day}${tail}`;
}

export type Brief = { headline: string; emphasis: string | null; subline: string };

const NETWORKING = /network|mixer|coffee|meet-?up|social|reception|panel|alumni/i;
const RECRUITING = /recruit|info session|career|intern|hiring|tech talk|fair/i;

function isNetworking(e: MockEvent): boolean {
  return e.kind === "COFFEE_CHAT" || NETWORKING.test(e.title);
}
function isRecruiting(e: MockEvent): boolean {
  return (
    e.kind === "INFO_SESSION" ||
    e.kind === "COFFEE_CHAT" ||
    RECRUITING.test(`${e.title} ${e.organizerCompany ?? ""}`)
  );
}

function count(n: number, singular: string, plural = `${singular}s`): string {
  const words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
  const w = n < words.length ? words[n] : String(n);
  return `${w} ${n === 1 ? singular : plural}`;
}

function daysUntil(iso: string, now: Date): number {
  return Math.ceil((new Date(iso).getTime() - now.getTime()) / 86_400_000);
}

/**
 * Only undecided, upcoming events go in. `now` is a parameter so the result
 * is reproducible in tests and so the "this week" window is explicit.
 */
export function buildBrief(pending: MockEvent[], now: Date = new Date()): Brief {
  const n = pending.length;
  if (n === 0) {
    return {
      headline: "Nothing new. Enjoy the quiet.",
      emphasis: "quiet",
      subline: "Lumi will keep reading your inbox twice a day and bring anything worth a look here.",
    };
  }

  const deadlines = pending.filter((e) => e.kind === "DEADLINE");
  const events = pending.filter((e) => e.kind !== "DEADLINE");
  const networking = events.filter(isNetworking);
  const recruiting = events.filter(isRecruiting);
  const thisWeek = pending.filter((e) => daysUntil(e.startTime, now) <= 7);
  const top = [...pending].sort(
    (a, b) => (b.relevance ?? 3) - (a.relevance ?? 3) || a.startTime.localeCompare(b.startTime)
  )[0];
  const soonest = deadlines.sort((a, b) => a.startTime.localeCompare(b.startTime))[0];

  const parts: string[] = [];
  if (recruiting.length) parts.push(count(recruiting.length, "recruiting event"));
  const other = events.length - recruiting.length;
  if (other > 0) parts.push(count(other, "other event"));
  if (deadlines.length) parts.push(count(deadlines.length, "deadline"));
  const inventory = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0];

  let subline = `${inventory[0].toUpperCase()}${inventory.slice(1)}.`;
  if (top && (top.relevance ?? 3) >= 4) {
    subline += ` If you only make one, make it ${shortTitle(top.title)} on ${weekday(top.startTime, top.timezone)}.`;
  } else if (soonest) {
    subline += ` The ${shortTitle(soonest.title)} deadline is ${weekday(soonest.startTime, soonest.timezone)}.`;
  }

  if (deadlines.length && events.length === 0) {
    return { headline: "One eye on the calendar.", emphasis: "calendar", subline };
  }
  if (thisWeek.length >= 3) {
    return { headline: "Looks like it’s gonna be a busy week.", emphasis: "busy", subline };
  }
  if (networking.length >= 2 || (networking.length === 1 && n === 1)) {
    return { headline: "Let’s go network!", emphasis: "network", subline };
  }
  if (n === 1) {
    return { headline: "Just one thing to decide.", emphasis: "one", subline };
  }
  return { headline: "A few things worth a look.", emphasis: "few", subline };
}

/** "Changemaker Fellowship 2026 — Application Deadline" → "Changemaker Fellowship 2026" */
export function shortTitle(title: string): string {
  return title.split(/\s[—–-]\s|:\s/)[0].trim();
}
