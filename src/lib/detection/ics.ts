import ical from "node-ical";
import type { ExtractedEvent } from "@/lib/detection/types";

/**
 * Parse one or more VEVENTs out of an .ics attachment.
 * Highest-confidence detection path — no LLM needed.
 */
export function parseIcs(content: string): ExtractedEvent[] {
  try {
    const data = ical.sync.parseICS(content);
    const events: ExtractedEvent[] = [];

    for (const key of Object.keys(data)) {
      const comp = data[key];
      if (comp.type !== "VEVENT") continue;

      // One malformed VEVENT (no DTSTART, unparseable date) must not discard
      // the rest of the calendar — a Handshake feed carries dozens.
      const start = comp.start as (Date & { tz?: string }) | undefined;
      if (!(start instanceof Date) || Number.isNaN(start.getTime())) continue;
      const end = comp.end as Date | undefined;

      events.push({
        title: (comp.summary as string) || "Untitled event",
        description: (comp.description as string) ?? "",
        startTime: start.toISOString(),
        endTime: end instanceof Date && !Number.isNaN(end.getTime()) ? end.toISOString() : undefined,
        timezone: start.tz ?? "UTC",
        locationName: (comp.location as string) ?? undefined,
        organizerName:
          (comp.organizer as { params?: { CN?: string } })?.params?.CN ?? undefined,
        rsvpLink: (comp.url as string) ?? undefined,
        confidence: 1.0,
        kind: "MEETING",
        sourceUid: (comp.uid as string) || undefined,
      });
    }
    return events;
  } catch {
    return [];
  }
}
