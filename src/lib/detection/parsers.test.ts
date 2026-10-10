import { describe, expect, it } from "vitest";
import { parseIcs } from "@/lib/detection/ics";
import { parseSchemaOrg } from "@/lib/detection/schema";

const vevent = (lines: string[]) => ["BEGIN:VEVENT", ...lines, "END:VEVENT"].join("\r\n");
const calendar = (...events: string[]) =>
  ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//test//EN", ...events, "END:VCALENDAR"].join("\r\n");

describe("parseIcs", () => {
  it("extracts a VEVENT at full confidence", () => {
    const events = parseIcs(
      calendar(
        vevent([
          "UID:abc-123",
          "DTSTART:20300917T220000Z",
          "DTEND:20300917T230000Z",
          "SUMMARY:Cloud Engineering Info Session",
          "LOCATION:Kimmel 405",
          "URL:https://example.edu/rsvp",
        ])
      )
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      title: "Cloud Engineering Info Session",
      startTime: "2030-09-17T22:00:00.000Z",
      endTime: "2030-09-17T23:00:00.000Z",
      locationName: "Kimmel 405",
      rsvpLink: "https://example.edu/rsvp",
      confidence: 1,
      sourceUid: "abc-123",
    });
  });

  it("returns every event in a multi-event feed", () => {
    const events = parseIcs(
      calendar(
        vevent(["UID:1", "DTSTART:20300917T220000Z", "SUMMARY:One"]),
        vevent(["UID:2", "DTSTART:20300918T220000Z", "SUMMARY:Two"])
      )
    );
    expect(events.map((e) => e.title)).toEqual(["One", "Two"]);
  });

  it("skips a VEVENT with no start instead of discarding the whole feed", () => {
    const events = parseIcs(
      calendar(
        vevent(["UID:broken", "SUMMARY:No start time"]),
        vevent(["UID:ok", "DTSTART:20300918T220000Z", "SUMMARY:Fine"])
      )
    );
    expect(events.map((e) => e.title)).toEqual(["Fine"]);
  });

  it("falls back to a placeholder title", () => {
    const events = parseIcs(calendar(vevent(["UID:1", "DTSTART:20300917T220000Z"])));
    expect(events[0].title).toBe("Untitled event");
  });

  it("returns nothing for garbage", () => {
    expect(parseIcs("this is not a calendar")).toEqual([]);
    expect(parseIcs("")).toEqual([]);
  });
});

const ld = (data: unknown) => `<html><script type="application/ld+json">${JSON.stringify(data)}</script></html>`;

describe("parseSchemaOrg", () => {
  const event = {
    "@type": "Event",
    name: "Fall Hackathon",
    startDate: "2030-10-03T18:00:00-04:00",
    endDate: "2030-10-03T21:00:00-04:00",
    location: { name: "Tandon MakerSpace", address: { streetAddress: "6 MetroTech" } },
    organizer: { name: "NYU ACM" },
    url: "https://example.edu/hack",
  };

  it("extracts an Event node", () => {
    const [e] = parseSchemaOrg(ld(event));
    expect(e).toMatchObject({
      title: "Fall Hackathon",
      startTime: "2030-10-03T22:00:00.000Z",
      endTime: "2030-10-04T01:00:00.000Z",
      locationName: "Tandon MakerSpace",
      locationAddress: "6 MetroTech",
      organizerName: "NYU ACM",
      rsvpLink: "https://example.edu/hack",
      confidence: 0.95,
    });
  });

  it("finds events inside arrays and @graph containers", () => {
    expect(parseSchemaOrg(ld([{ "@type": "Organization", name: "x" }, event]))).toHaveLength(1);
    expect(parseSchemaOrg(ld({ "@graph": [event, { ...event, name: "Second" }] }))).toHaveLength(2);
  });

  it("accepts a multi-typed node", () => {
    expect(parseSchemaOrg(ld({ ...event, "@type": ["Event", "SocialEvent"] }))).toHaveLength(1);
  });

  it("ignores non-event markup", () => {
    expect(parseSchemaOrg(ld({ "@type": "Product", name: "Shoes" }))).toEqual([]);
  });

  it("skips an event with a missing or unparseable date rather than throwing", () => {
    expect(parseSchemaOrg(ld({ ...event, startDate: "sometime soon" }))).toEqual([]);
    expect(parseSchemaOrg(ld({ ...event, startDate: undefined }))).toEqual([]);
  });

  it("drops an unparseable end date but keeps the event", () => {
    const [e] = parseSchemaOrg(ld({ ...event, endDate: "late" }));
    expect(e.endTime).toBeUndefined();
  });

  it("survives malformed JSON and HTML without markup", () => {
    expect(parseSchemaOrg('<script type="application/ld+json">{not json</script>')).toEqual([]);
    expect(parseSchemaOrg("<p>hello</p>")).toEqual([]);
  });
});
