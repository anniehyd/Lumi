import type { MockEvent } from "@/lib/mock/events";

/**
 * The decision list: undecided and still-upcoming events. Untouched cards
 * come first; cards the user has already marked Maybe sink below them so the
 * top of the page is always what has not been looked at. Within each group,
 * most relevant first, soonest within a rating.
 */
export function pendingOf(events: MockEvent[], now = Date.now()): MockEvent[] {
  return events
    .filter((e) => e.status === "PENDING" || e.status === "MAYBE")
    .filter((e) => new Date(e.startTime).getTime() > now)
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        (b.relevance ?? 3) - (a.relevance ?? 3) ||
        a.startTime.localeCompare(b.startTime)
    );
}

function rank(e: MockEvent): number {
  return e.status === "MAYBE" ? 1 : 0;
}

/** How many cards are untouched, and how many are parked as Maybe. */
export function countPending(pending: MockEvent[]): { undecided: number; maybe: number } {
  let maybe = 0;
  for (const e of pending) if (e.status === "MAYBE") maybe++;
  return { undecided: pending.length - maybe, maybe };
}
