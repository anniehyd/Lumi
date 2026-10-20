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
    // Publishers wrap events in a top-level array or an @graph container.
    const top = Array.isArray(data) ? data : [data];
    const nodes = top.flatMap((node) => {
      const graph = (node as { "@graph"?: unknown } | null)?.["@graph"];
      return Array.isArray(graph) ? graph : [node];
    });
    for (const node of nodes) {
      if (!node || typeof node !== "object") continue;
      const n = node as Record<string, unknown>;
      const type = n["@type"];
      if (type !== "Event" && !(Array.isArray(type) && type.includes("Event"))) continue;

      const name = typeof n.name === "string" ? n.name : "";
      // Markup with a missing or unparseable date falls through to the next
      // tier instead of throwing and failing the whole email.
      const start = toIso(n.startDate);
      if (!name || !start) continue;

      const location = n.location as Record<string, unknown> | undefined;
      const organizer = n.organizer as Record<string, unknown> | undefined;

      events.push({
        title: name,
        description: (n.description as string) ?? "",
        startTime: start,
        endTime: toIso(n.endDate) ?? undefined,
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

function toIso(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
