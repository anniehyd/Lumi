import type { MockEvent } from "@/lib/mock/events";

// RFC 5545 iCalendar serialization.
// Text fields: escape \\, \n, ;, , per spec. Long lines folded at 75 chars.

function escape(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let remaining = line;
  chunks.push(remaining.slice(0, 75));
  remaining = remaining.slice(75);
  while (remaining.length > 0) {
    chunks.push(" " + remaining.slice(0, 74));
    remaining = remaining.slice(74);
  }
  return chunks.join("\r\n");
}

function formatDateUTC(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

function eventBlock(event: MockEvent): string[] {
  const now = formatDateUTC(new Date().toISOString());
  const start = formatDateUTC(event.startTime);
  const end = event.endTime
    ? formatDateUTC(event.endTime)
    : formatDateUTC(new Date(new Date(event.startTime).getTime() + 60 * 60 * 1000).toISOString());

  const locationParts = [event.locationName, event.locationAddress]
    .filter(Boolean)
    .join(", ");

  const lines = [
    "BEGIN:VEVENT",
    `UID:${event.id}@lumi.app`,
    `DTSTAMP:${now}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${escape(event.title)}`,
    event.description && `DESCRIPTION:${escape(event.description)}`,
    locationParts && `LOCATION:${escape(locationParts)}`,
    event.organizerCompany &&
      `ORGANIZER;CN=${escape(event.organizerCompany)}:mailto:noreply@lumi.app`,
    event.rsvpLink && `URL:${event.rsvpLink}`,
    "STATUS:CONFIRMED",
    "TRANSP:OPAQUE",
    "END:VEVENT",
  ].filter(Boolean) as string[];

  return lines.map(foldLine);
}

export function buildCalendar(events: MockEvent[], name = "Lumi"): string {
  const header = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Lumi//Event Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escape(name)}`,
    "X-WR-TIMEZONE:America/New_York",
    "X-PUBLISHED-TTL:PT15M",
  ];
  const footer = ["END:VCALENDAR"];
  const body = events.flatMap(eventBlock);
  return [...header, ...body, ...footer].join("\r\n") + "\r\n";
}

export function buildSingleEvent(event: MockEvent): string {
  return buildCalendar([event], event.title);
}
