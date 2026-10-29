import type { MockEvent } from "@/lib/mock/events";
import { isSoon } from "@/lib/urgency";

/**
 * The decision list: undecided and still-upcoming events, in three bands.
 * Anything inside the next two days comes first, since a deadline tonight
 * must not hide under a five-star coffee chat on Friday. Then the rest of
 * the untouched cards. Cards the user has already marked Maybe sink to the
 * bottom so the top of the page is always what has not been looked at.
 * Within each band, most relevant first, soonest within a rating.
 */
export function pendingOf(events: MockEvent[], now = Date.now()): MockEvent[] {
  return events
    .filter((e) => e.status === "PENDING" || e.status === "MAYBE")
    .filter((e) => new Date(e.startTime).getTime() > now)
    .sort(
      (a, b) =>
        band(a, now) - band(b, now) ||
        (b.relevance ?? 3) - (a.relevance ?? 3) ||
        a.startTime.localeCompare(b.startTime)
    );
}

function band(e: MockEvent, now: number): number {
  if (e.status === "MAYBE") return 2;
  return isSoon(e.startTime, now) ? 0 : 1;
}

/** How many cards are untouched, and how many are parked as Maybe. */
export function countPending(pending: MockEvent[]): { undecided: number; maybe: number } {
  let maybe = 0;
  for (const e of pending) if (e.status === "MAYBE") maybe++;
  return { undecided: pending.length - maybe, maybe };
}

/** Accepted events still ahead, soonest first: what the page shows when there is nothing to decide. */
export function upcomingOf(events: MockEvent[], now = Date.now(), limit = 3): MockEvent[] {
  return events
    .filter((e) => e.status === "ACCEPTED" && new Date(e.startTime).getTime() > now)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .slice(0, limit);
}
