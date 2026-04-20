import type { MockEvent } from "@/lib/mock/events";

export type ExtractedEvent = {
  title: string;
  description: string;
  startTime: string; // ISO 8601
  endTime?: string;  // ISO 8601
  timezone: string;
  locationName?: string;
  locationAddress?: string;
  organizerName?: string;
  organizerCompany?: string;
  rsvpLink?: string;
  rsvpDeadline?: string;
  attire?: string;
  confidence: number; // 0..1
  kind: MockEvent["kind"];
};
