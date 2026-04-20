import Anthropic from "@anthropic-ai/sdk";
import type { ExtractedEvent } from "@/lib/detection/types";

/**
 * Claude extraction via `tool_use` — the model is forced to call `save_events`
 * with a structured payload, giving us type-safe JSON out with zero prompt parsing.
 *
 * Extracts MULTIPLE events from a single email (newsletters often bundle several).
 * If no events are found, returns [].
 */

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (client) return client;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  client = new Anthropic({ apiKey: key });
  return client;
}

const SAVE_EVENTS_TOOL = {
  name: "save_events",
  description:
    "Save the events found in this email. If the email contains no events, pass an empty array. Extract every distinct event — newsletters often bundle several.",
  input_schema: {
    type: "object" as const,
    properties: {
      events: {
        type: "array" as const,
        description: "Every distinct event found in this email.",
        items: {
          type: "object" as const,
          properties: {
            title: { type: "string" as const, description: "Short event title." },
            description: {
              type: "string" as const,
              description: "1-2 sentence summary of the event.",
            },
            startTime: {
              type: "string" as const,
              description: "ISO 8601 start time with timezone, e.g. 2026-04-28T12:00:00-04:00.",
            },
            endTime: {
              type: "string" as const,
              description: "ISO 8601 end time. Omit if not specified.",
            },
            timezone: {
              type: "string" as const,
              description: "IANA timezone, e.g. America/New_York.",
            },
            locationName: { type: "string" as const },
            locationAddress: { type: "string" as const },
            organizerName: { type: "string" as const },
            organizerCompany: { type: "string" as const },
            rsvpLink: { type: "string" as const },
            rsvpDeadline: { type: "string" as const, description: "ISO 8601 if mentioned." },
            attire: { type: "string" as const },
            confidence: {
              type: "number" as const,
              description: "Your confidence this is a real event, 0..1.",
            },
            kind: {
              type: "string" as const,
              enum: ["MEETING", "INFO_SESSION", "DEADLINE", "COFFEE_CHAT"],
            },
          },
          required: ["title", "startTime", "timezone", "confidence", "kind", "description"],
        },
      },
    },
    required: ["events"],
  },
};

const SYSTEM_PROMPT = `You extract event invitations from emails.

Rules:
- Extract EVERY event in the email — newsletters and digests often contain multiple.
- A "deadline" (application due, RSVP by) is an event. Set kind=DEADLINE, use the deadline as startTime.
- Job postings, general announcements without a time, and unsubscribe footers are NOT events.
- If no events, return an empty array.
- Always infer a timezone. Default to the sender's likely timezone (e.g. US universities → America/New_York).
- Confidence: 1.0 = explicit date + location + RSVP; 0.8 = date + title; <0.7 = ambiguous.
- Use the current year (2026) if the email omits it and the date would otherwise be in the past.`;

export async function extractWithClaude(input: {
  subject: string;
  from: string;
  bodyText: string;
  receivedAt: Date;
}): Promise<ExtractedEvent[]> {
  const anthropic = getClient();
  if (!anthropic) return [];

  const userContent = `From: ${input.from}
Subject: ${input.subject}
Received: ${input.receivedAt.toISOString()}

---

${input.bodyText}`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    tools: [SAVE_EVENTS_TOOL],
    tool_choice: { type: "tool", name: "save_events" },
    messages: [{ role: "user", content: userContent }],
  });

  const toolUse = response.content.find((c) => c.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") return [];

  const input_ = toolUse.input as { events?: Partial<ExtractedEvent>[] };
  const events = input_.events ?? [];

  return events.filter(isValid).map((e) => ({
    title: e.title!,
    description: e.description ?? "",
    startTime: e.startTime!,
    endTime: e.endTime,
    timezone: e.timezone!,
    locationName: e.locationName,
    locationAddress: e.locationAddress,
    organizerName: e.organizerName,
    organizerCompany: e.organizerCompany,
    rsvpLink: e.rsvpLink,
    rsvpDeadline: e.rsvpDeadline,
    attire: e.attire,
    confidence: e.confidence ?? 0.7,
    kind: (e.kind ?? "MEETING") as ExtractedEvent["kind"],
  }));
}

function isValid(e: Partial<ExtractedEvent>): e is ExtractedEvent {
  return typeof e.title === "string" && typeof e.startTime === "string";
}
