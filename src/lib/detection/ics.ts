import ical from "node-ical";
import type { ExtractedEvent } from "@/lib/detection/types";

type IcalDate = Date & { tz?: string; dateOnly?: boolean };

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * node-ical builds all-day (VALUE=DATE) and floating (no TZID, no Z) values
 * from local fields in the server's zone, so their instant depends on where
 * the server runs. Hand those back as a date or a wall-clock time and let the
 * pipeline place them in the user's zone; zoned and UTC values are absolute.
 */
function icsTime(d: IcalDate): string {
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  if (d.dateOnly) return date;
  if (!d.tz) return `${date}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  return d.toISOString();
}

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
      const start = comp.start as IcalDate | undefined;
      if (!(start instanceof Date) || Number.isNaN(start.getTime())) continue;
      const end = comp.end as IcalDate | undefined;
      const hasEnd = end instanceof Date && !Number.isNaN(end.getTime());

      events.push({
        title: (comp.summary as string) || "Untitled event",
        description: (comp.description as string) ?? "",
        startTime: icsTime(start),
        endTime: hasEnd ? icsTime(end) : undefined,
        // Floating and all-day values carry no zone; persistEvents reads them
        // in the user's zone.
        timezone: start.dateOnly || !start.tz ? "" : start.tz,
        isAllDay: start.dateOnly === true,
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
