import type { MockEvent } from "@/lib/mock/events";

export type ExtractedEvent = {
  title: string;
  description: string;
  // ISO 8601. With an offset or Z it is absolute; without one it is wall-clock
  // time in `timezone`; a bare date (2026-11-05) means all day.
  startTime: string;
  endTime?: string;  // same forms; for all-day events the day after the last day
  timezone: string;  // IANA zone, or empty for the user's own zone
  isAllDay?: boolean;
  locationName?: string;
  locationAddress?: string;
  organizerName?: string;
  organizerCompany?: string;
  rsvpLink?: string;
  rsvpDeadline?: string;
  attire?: string;
  confidence: number; // 0..1
  kind: MockEvent["kind"];
  sourceUid?: string; // stable upstream id (ICS UID) when the source has one
  relevance?: number; // 1..5 — fit to the user's interests
  relevanceReason?: string; // the model's one line on why, for the LLM tier
  summary?: string; // "Looks like …" one-liner; model-written for the LLM tier
};
