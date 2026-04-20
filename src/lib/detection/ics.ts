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

      events.push({
        title: (comp.summary as string) ?? "Untitled event",
        description: (comp.description as string) ?? "",
        startTime: (comp.start as Date).toISOString(),
        endTime: comp.end ? (comp.end as Date).toISOString() : undefined,
        timezone: (comp.start as Date & { tz?: string }).tz ?? "UTC",
        locationName: (comp.location as string) ?? undefined,
        organizerName:
          (comp.organizer as { params?: { CN?: string } })?.params?.CN ?? undefined,
        rsvpLink: (comp.url as string) ?? undefined,
        confidence: 1.0,
        kind: "MEETING",
      });
    }
    return events;
  } catch {
    return [];
  }
}
