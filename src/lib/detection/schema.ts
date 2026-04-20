import type { ExtractedEvent } from "@/lib/detection/types";

/**
 * Parse schema.org Event markup (JSON-LD) from email HTML.
 * Eventbrite, Luma, and many university newsletters embed this.
 * https://schema.org/Event
 */
export function parseSchemaOrg(html: string): ExtractedEvent[] {
  const matches = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );
  const events: ExtractedEvent[] = [];

  for (const m of matches) {
    let data: unknown;
    try {
      data = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    const nodes = Array.isArray(data) ? data : [data];
    for (const node of nodes) {
      if (!node || typeof node !== "object") continue;
      const n = node as Record<string, unknown>;
      const type = n["@type"];
      if (type !== "Event" && !(Array.isArray(type) && type.includes("Event"))) continue;

      const name = (n.name as string) ?? "";
      const startDate = (n.startDate as string) ?? "";
      if (!name || !startDate) continue;

      const location = n.location as Record<string, unknown> | undefined;
      const organizer = n.organizer as Record<string, unknown> | undefined;

      events.push({
        title: name,
        description: (n.description as string) ?? "",
        startTime: new Date(startDate).toISOString(),
        endTime: n.endDate ? new Date(n.endDate as string).toISOString() : undefined,
        timezone: (n.timezone as string) ?? "UTC",
        locationName: (location?.name as string) ?? undefined,
        locationAddress:
          typeof location?.address === "string"
            ? location.address
            : (location?.address as { streetAddress?: string })?.streetAddress,
        organizerName: (organizer?.name as string) ?? undefined,
        rsvpLink: (n.url as string) ?? undefined,
        confidence: 0.95,
        kind: "MEETING",
      });
    }
  }
  return events;
}
