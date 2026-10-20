import { fromZonedTime } from "date-fns-tz";

/**
 * Group scheduling, the When2meet part of Lumi.
 *
 * A poll is a grid: a list of days, a daily window, and a slot length. Every
 * participant paints the slots they are free for. Slot keys are wall-clock
 * strings in the poll's time zone ("2026-10-20T14:30"), so people in the
 * same place see the same grid and no DST arithmetic happens until a chosen
 * time is turned into a real Date for the calendar.
 *
 * Everything here is pure so it can be tested without a database.
 */

export type Poll = {
  slug: string;
  title: string;
  timezone: string;
  days: string[]; // YYYY-MM-DD
  dayStart: number; // minutes after midnight
  dayEnd: number; // minutes after midnight, exclusive
  slotMinutes: number;
  finalStart: string | null;
  finalEnd: string | null;
  /** Names the organizer is waiting on. Empty when the poll was made without a list. */
  expected: string[];
  ownerId: string | null;
  createdAt: string;
};

export type Response = { name: string; slots: string[]; updatedAt: string };

export type BestTime = {
  day: string;
  start: string; // slot key
  end: string; // exclusive slot key (start of the slot after the last free one)
  count: number;
  names: string[];
  missing: string[];
};

const KEY_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function minutesToClock(min: number): string {
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}

export function slotKey(day: string, minutes: number): string {
  return `${day}T${minutesToClock(minutes)}`;
}

export function parseKey(key: string): { day: string; minutes: number } | null {
  if (!KEY_RE.test(key)) return null;
  const [day, clock] = key.split("T");
  const [h, m] = clock.split(":").map(Number);
  return { day, minutes: h * 60 + m };
}

/** Every slot key of a poll, day by day, in order. */
export function slotKeys(poll: Pick<Poll, "days" | "dayStart" | "dayEnd" | "slotMinutes">): string[] {
  const keys: string[] = [];
  for (const day of poll.days) {
    for (let m = poll.dayStart; m < poll.dayEnd; m += poll.slotMinutes) keys.push(slotKey(day, m));
  }
  return keys;
}

/** The times down the side of the grid (one per row). */
export function slotTimes(poll: Pick<Poll, "dayStart" | "dayEnd" | "slotMinutes">): number[] {
  const out: number[] = [];
  for (let m = poll.dayStart; m < poll.dayEnd; m += poll.slotMinutes) out.push(m);
  return out;
}

/** Keep only keys that belong to this poll's grid, deduplicated and sorted. */
export function sanitizeSlots(
  poll: Pick<Poll, "days" | "dayStart" | "dayEnd" | "slotMinutes">,
  raw: unknown
): string[] {
  if (!Array.isArray(raw)) return [];
  const valid = new Set(slotKeys(poll));
  const out = new Set<string>();
  for (const k of raw) if (typeof k === "string" && valid.has(k)) out.add(k);
  return [...out].sort();
}

/** Who is free in each slot. Slots nobody painted are absent. */
export function tally(responses: Response[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const r of responses) {
    for (const k of r.slots) map.set(k, [...(map.get(k) ?? []), r.name]);
  }
  return map;
}

/**
 * The stretches where the most people are free, best first.
 *
 * A stretch is a run of consecutive slots on one day where every slot has at
 * least `count` people, and `count` is the largest value with any such run.
 * Ranking: more people, then longer, then earlier. With `minCount` set the
 * search also reports stretches at lower counts, so "everyone but one" shows
 * up when nobody has a slot in common.
 */
export function bestTimes(
  poll: Pick<Poll, "days" | "dayStart" | "dayEnd" | "slotMinutes">,
  responses: Response[],
  opts: { limit?: number; minCount?: number } = {}
): BestTime[] {
  const limit = opts.limit ?? 5;
  const people = responses.map((r) => r.name);
  if (people.length === 0) return [];
  const free = tally(responses);
  const minCount = Math.max(1, opts.minCount ?? Math.max(1, people.length - 1));

  const out: BestTime[] = [];
  for (let count = people.length; count >= minCount; count--) {
    for (const day of poll.days) {
      let run: string[] = [];
      let runNames: Set<string> | null = null;
      const flush = () => {
        if (run.length === 0) return;
        const names = [...(runNames ?? [])].sort();
        const endMin = parseKey(run[run.length - 1])!.minutes + poll.slotMinutes;
        out.push({
          day,
          start: run[0],
          end: slotKey(day, endMin),
          count: names.length,
          names,
          missing: people.filter((p) => !names.includes(p)).sort(),
        });
        run = [];
        runNames = null;
      };
      for (let m = poll.dayStart; m < poll.dayEnd; m += poll.slotMinutes) {
        const key = slotKey(day, m);
        const here = free.get(key) ?? [];
        if (here.length >= count) {
          // The run's people are the intersection, so a run of "4 free" never
          // silently mixes two different groups of four.
          const next: string[] = runNames ? here.filter((n) => runNames!.has(n)) : here;
          if (next.length >= count) {
            run.push(key);
            runNames = new Set(next);
            continue;
          }
          flush();
          run = [key];
          runNames = new Set(here);
          continue;
        }
        flush();
      }
      flush();
    }
    if (out.length >= limit) break;
  }

  // Runs found at a lower `count` that are really the same people as a run
  // already listed at a higher count are duplicates by construction, so a
  // plain sort is enough.
  return out
    .sort(
      (a, b) =>
        b.count - a.count ||
        slotsIn(b, poll.slotMinutes) - slotsIn(a, poll.slotMinutes) ||
        a.start.localeCompare(b.start)
    )
    .filter((t, i, arr) => arr.findIndex((u) => u.start === t.start && u.end === t.end && u.count === t.count) === i)
    .slice(0, limit);
}

function slotsIn(t: BestTime, slotMinutes: number): number {
  return (parseKey(t.end)!.minutes - parseKey(t.start)!.minutes) / slotMinutes;
}

/** A slot key in the poll's zone as a real instant. */
export function keyToDate(key: string, timezone: string): Date {
  return fromZonedTime(`${key}:00`, timezone);
}

export function formatClock(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hour}:${pad(m)} ${period}` : `${hour} ${period}`;
}

export function formatDay(day: string, opts: { weekday?: "short" | "long"; month?: "short" | "long" } = {}): string {
  const [y, mo, d] = day.split("-").map(Number);
  return new Date(y, mo - 1, d).toLocaleDateString("en-US", {
    weekday: opts.weekday ?? "short",
    month: opts.month ?? "short",
    day: "numeric",
  });
}

export function formatRange(t: Pick<BestTime, "day" | "start" | "end">): string {
  const s = parseKey(t.start)!.minutes;
  const e = parseKey(t.end)!.minutes;
  return `${formatDay(t.day)} · ${formatClock(s)}–${formatClock(e)}`;
}

/** "Mon 4 PM–6 PM": the range as it reads in a sentence. */
export function shortRange(t: Pick<BestTime, "day" | "start" | "end">): string {
  const s = parseKey(t.start)!.minutes;
  const e = parseKey(t.end)!.minutes;
  return `${formatDay(t.day).split(",")[0]} ${formatClock(s)}–${formatClock(e)}`;
}

/**
 * One sentence about where the group stands, in Lumi's voice. `waiting` is
 * how many of the organizer's expected names have not answered; with a list
 * the sentence says so, and "everyone" only means everyone on the list.
 */
export function headline(best: BestTime[], total: number, waiting = 0): { text: string; emphasis: string } {
  const tail = waiting > 0 ? ` Still waiting on ${waiting}.` : "";
  if (total === 0) return { text: `Nobody has answered yet.${waiting > 0 ? ` Waiting on ${waiting}.` : ""}`, emphasis: "yet" };
  if (total === 1) return { text: `One answer in. Share the link.${tail}`, emphasis: "link" };
  const top = best[0];
  if (!top) return { text: `No overlap yet. Keep the answers coming.${tail}`, emphasis: "overlap" };
  if (top.count === total) {
    if (waiting > 0) {
      const who = `all ${total} so far`;
      return { text: `Looks like ${shortRange(top)} works for ${who}.${tail}`, emphasis: who };
    }
    return { text: `Looks like ${shortRange(top)} works for everyone.`, emphasis: "everyone" };
  }
  const who = top.missing.length === 1 ? `everyone but ${top.missing[0]}` : `${top.count} of ${total}`;
  return { text: `Looks like ${shortRange(top)} works for ${who}.${tail}`, emphasis: who };
}

/** Validate a poll definition from a form or API body. Returns the error, or null. */
export function validatePollInput(input: {
  title?: unknown;
  days?: unknown;
  dayStart?: unknown;
  dayEnd?: unknown;
  slotMinutes?: unknown;
  timezone?: unknown;
  expected?: unknown;
}): string | null {
  if (typeof input.title !== "string" || !input.title.trim()) return "Give the poll a title.";
  if (input.title.trim().length > 120) return "Keep the title under 120 characters.";
  if (!Array.isArray(input.days) || input.days.length === 0) return "Pick at least one day.";
  if (input.days.length > 31) return "Pick at most 31 days.";
  if (!input.days.every((d) => typeof d === "string" && DAY_RE.test(d))) return "Days must be YYYY-MM-DD.";
  const start = Number(input.dayStart);
  const end = Number(input.dayEnd);
  const slot = Number(input.slotMinutes ?? 30);
  if (![15, 30, 60].includes(slot)) return "Slots must be 15, 30 or 60 minutes.";
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > 1440 || end <= start)
    return "The daily window must start before it ends.";
  if ((end - start) % slot !== 0) return "The daily window must be a whole number of slots.";
  if (((end - start) / slot) * input.days.length > 31 * 96) return "That grid is too large.";
  if (typeof input.timezone !== "string" || !input.timezone) return "A time zone is required.";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: input.timezone });
  } catch {
    return "Unknown time zone.";
  }
  if (input.expected !== undefined) {
    if (!Array.isArray(input.expected) || !input.expected.every((n) => typeof n === "string")) return "Names must be a list.";
    if (input.expected.length > 50) return "List at most 50 people.";
    if (input.expected.some((n: string) => n.trim().length > 40)) return "Keep each name under 40 characters.";
  }
  return null;
}

/**
 * "Who needs to answer?" as typed: comma- or newline-separated names.
 * Whitespace is squeezed and names that differ only in case are one person.
 */
export function parseExpected(raw: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(/[,\n]/)) {
    const name = part.trim().replace(/\s+/g, " ");
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/**
 * Expected names with no answer yet, in the order the organizer listed them.
 * Matching ignores case and stray spaces, so "annie" has answered for "Annie".
 */
export function stillWaiting(expected: string[], responses: Pick<Response, "name">[]): string[] {
  const answered = new Set(responses.map((r) => r.name.trim().replace(/\s+/g, " ").toLowerCase()));
  return expected.filter((n) => !answered.has(n.trim().replace(/\s+/g, " ").toLowerCase()));
}

/** The picked time as real instants, or null while nothing is picked. */
export function finalInstants(
  poll: Pick<Poll, "finalStart" | "finalEnd" | "timezone">
): { startAt: Date; endAt: Date } | null {
  if (!poll.finalStart || !poll.finalEnd) return null;
  if (!parseKey(poll.finalStart) || !parseKey(poll.finalEnd)) return null;
  return { startAt: keyToDate(poll.finalStart, poll.timezone), endAt: keyToDate(poll.finalEnd, poll.timezone) };
}

/** An instant as Google's compact UTC form, 20261020T140000Z. */
export function compactUtc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * A "save to Google Calendar" link for the picked time. Built in the browser,
 * so nothing is stored; Google shows the event pre-filled and the person
 * saves it to whichever calendar they like.
 */
export function googleCalendarUrl(
  poll: Pick<Poll, "title" | "finalStart" | "finalEnd" | "timezone">,
  pollUrl?: string
): string | null {
  const range = finalInstants(poll);
  if (!range) return null;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: poll.title,
    dates: `${compactUtc(range.startAt)}/${compactUtc(range.endAt)}`,
    ctz: poll.timezone,
  });
  if (pollUrl) params.set("details", `Picked on the group poll: ${pollUrl}`);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Short, URL-safe, unguessable enough for a link people share in a group chat. */
export function makeSlug(random: () => number = Math.random): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 10; i++) out += alphabet[Math.floor(random() * alphabet.length)];
  return out;
}
