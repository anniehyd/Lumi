import { buildSingleEvent } from "@/lib/ics";
import { finalInstants, type Poll } from "@/lib/meet";
import type { MockEvent } from "@/lib/mock/events";

/**
 * The picked time of a poll as a one-event .ics file, so every participant
 * (not only the signed-in owner) can put it on whatever calendar they use.
 * Slot keys are wall-clock strings in the poll's zone; `finalInstants` turns
 * them into real instants and the .ics carries them as UTC.
 *
 * Returns null while nothing is picked.
 */
export function buildFinalIcs(poll: Poll, pollUrl?: string): string | null {
  const range = finalInstants(poll);
  if (!range) return null;
  const event: MockEvent = {
    id: `meet-${poll.slug}-${poll.finalStart}`,
    status: "ACCEPTED",
    confidence: 1,
    detectedVia: "MANUAL",
    kind: "MEETING",
    title: poll.title,
    description: pollUrl ? `Picked on the group poll: ${pollUrl}` : "Picked on the group poll.",
    startTime: range.startAt.toISOString(),
    endTime: range.endAt.toISOString(),
    timezone: poll.timezone,
    rsvpLink: pollUrl,
    sourceEmailId: "",
  };
  return buildSingleEvent(event);
}
