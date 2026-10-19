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

/** Validate a poll definition from a form or API body. Returns the error, or null. */
export function validatePollInput(input: {
  title?: unknown;
  days?: unknown;
  dayStart?: unknown;
  dayEnd?: unknown;
  slotMinutes?: unknown;
  timezone?: unknown;
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
  return null;
}

/** Short, URL-safe, unguessable enough for a link people share in a group chat. */
export function makeSlug(random: () => number = Math.random): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 10; i++) out += alphabet[Math.floor(random() * alphabet.length)];
  return out;
}
