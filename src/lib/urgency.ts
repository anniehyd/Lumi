import type { MockEvent } from "@/lib/mock/events";

/** Anything starting or due inside this window gets a chip and floats up the list. */
export const SOON_MS = 48 * 3600_000;

const HOUR = 3600_000;
const DAY = 24 * HOUR;

/** Is the event still ahead and inside the two-day window? */
export function isSoon(startISO: string, now = Date.now()): boolean {
  const diff = new Date(startISO).getTime() - now;
  return diff > 0 && diff < SOON_MS;
}

/** YYYY-MM-DD in the event's own timezone, so "tomorrow" means the user's tomorrow. */
function localDay(ms: number, timeZone?: string): string {
  try {
    return new Date(ms).toLocaleDateString("en-CA", { timeZone });
  } catch {
    return new Date(ms).toLocaleDateString("en-CA");
  }
}

/**
 * "in 40 min", "in 6 hours", "tomorrow", "in 2 days", or null when the event
 * is past or more than two days away. Minutes and hours are used while it is
 * still the same calendar day; after midnight it becomes a day word.
 */
export function dueIn(startISO: string, now = Date.now(), timeZone?: string): string | null {
  const start = new Date(startISO).getTime();
  const diff = start - now;
  if (!(diff > 0 && diff < SOON_MS)) return null;
  if (diff < HOUR) return `in ${Math.max(1, Math.round(diff / 60_000))} min`;
  const today = localDay(now, timeZone);
  if (localDay(start, timeZone) === today) {
    const h = Math.round(diff / HOUR);
    return h <= 1 ? "in 1 hour" : `in ${h} hours`;
  }
  if (localDay(start, timeZone) === localDay(now + DAY, timeZone)) return "tomorrow";
  return "in 2 days";
}

/** The chip text for a card: "Due in 6 hours", "Due tomorrow", "In 2 days", or null. */
export function dueChip(
  e: Pick<MockEvent, "kind" | "startTime" | "timezone">,
  now = Date.now()
): string | null {
  const rel = dueIn(e.startTime, now, e.timezone);
  if (!rel) return null;
  if (e.kind === "DEADLINE") return `Due ${rel}`;
  return rel.charAt(0).toUpperCase() + rel.slice(1);
}
