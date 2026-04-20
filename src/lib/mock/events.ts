// Mock data derived from a real NYU Wasserman Center newsletter.
// Demonstrates Lumi's hardest case: one email → multiple events +
// deadlines + non-event announcements to filter out.

export type EventStatus = "PENDING" | "ACCEPTED" | "MAYBE" | "DECLINED";
export type DetectionMethod = "ICS" | "SCHEMA_ORG" | "KEYWORD" | "LLM";
export type EventKind = "MEETING" | "INFO_SESSION" | "DEADLINE" | "COFFEE_CHAT";

export type MockEvent = {
  id: string;
  status: EventStatus;
  confidence: number;
  detectedVia: DetectionMethod;
  kind: EventKind;
  title: string;
  description: string;
  startTime: string; // ISO
  endTime?: string;  // ISO
  timezone: string;
  locationName?: string;
  locationAddress?: string;
  organizerName?: string;
  organizerCompany?: string;
  rsvpLink?: string;
  sourceEmailId: string;
};

export type MockEmail = {
  id: string;
  from: string;
  fromName: string;
  subject: string;
  receivedAt: string; // ISO
  preview: string;
  bodyText: string;
  extractedEventIds: string[];
  ignoredSnippets: string[]; // non-event content Lumi filtered out
};

export const mockEmails: MockEmail[] = [
  {
    id: "email_wasserman_01",
    from: "wasserman@nyu.edu",
    fromName: "NYU Wasserman Center",
    subject: "In my 'Main Character and Graduated' Era",
    receivedAt: "2026-04-19T09:02:00-04:00",
    preview:
      "Share your post-grad plans, coffee chats with Marshall Wace, Weil Gotshal info session, Changemaker Fellowship deadline…",
    bodyText: `Share your post-grad plans by completing the Life Beyond the Square (LBTS) survey and make a lasting impact. Your feedback will help shape future NYU initiatives, strategies, and employer outreach efforts, creating better opportunities for future Violets.

Changemaker Fellowship 2026 Application
Deadline: April 24th
Awards grants of up to $5,000 for approximately 35 students working in areas of public service, social impact, and economic or racial inequality.

Wasserman Industry-Based Career Communities!
Career Communities help you explore career paths, prepare for the job search, and connect with opportunities based on chosen industries.

Employer Events

Coffee Chats with Marshall Wace
Apr 28, 12:00PM–2:00PM ET, Interview Room 4 – Wasserman Union Square
Join us for a coffee chat to learn about technology careers at Marshall Wace, a leading global hedge fund. Meet developers on our team, hear about the innovative projects we work on, and discover how technology drives everything we do.

Weil, Gotshal & Manges Hosts: An Intro to Careers in Big Law
April 28th, 5:00PM–6:00PM ET, Wasserman Center, Presentation Room B
Weil, Gotshal & Manges LLP invites undergraduate students of all class years to an information session introducing the path to a career in Big Law.

Employer Partner Corner

AlphaSights is hiring a Client Service Associate…
EY — CHARGE program interest form due May 15…
Teach for America — Join the Teacher Corps…
Verizon — Explore career paths…`,
    extractedEventIds: ["evt_marshall_wace", "evt_weil_gotshal", "evt_changemaker_deadline"],
    ignoredSnippets: [
      "Life Beyond the Square survey (no date)",
      "Career Communities (general program)",
      "AlphaSights job listing",
      "Teach for America recruitment",
      "Verizon careers page",
    ],
  },
  {
    id: "email_quince_01",
    from: "sam.chen@example.com",
    fromName: "Sam Chen",
    subject: "Dinner at Quince — Thursday?",
    receivedAt: "2026-04-18T18:44:00-04:00",
    preview:
      "Looking forward to celebrating with everyone. 7:30 at Quince — black tie, RSVP by Monday.",
    bodyText: `Hi all,

I've locked in a private room at Quince for Thursday May 7th at 7:30 PM. Dress code is black tie. Please RSVP by Monday so I can finalize the guest list with the restaurant.

Looking forward to celebrating with everyone.

— Sam`,
    extractedEventIds: ["evt_quince_dinner"],
    ignoredSnippets: [],
  },
  {
    id: "email_standup_01",
    from: "calendar-noreply@google.com",
    fromName: "Google Calendar",
    subject: "Invitation: Weekly Eng Standup @ Mon Apr 20 10:00 AM",
    receivedAt: "2026-04-17T14:12:00-04:00",
    preview: "Recurring weekly. Accept / Decline / Maybe.",
    bodyText: "ICS attachment — parsed directly without LLM.",
    extractedEventIds: ["evt_eng_standup"],
    ignoredSnippets: [],
  },
];

const wassermanUnionSquare = "726 Broadway, New York, NY 10003";

export const mockEvents: MockEvent[] = [
  {
    id: "evt_marshall_wace",
    status: "PENDING",
    confidence: 0.94,
    detectedVia: "LLM",
    kind: "COFFEE_CHAT",
    title: "Coffee Chats with Marshall Wace",
    description:
      "Coffee chat on technology careers at Marshall Wace, a global hedge fund. Meet developers and hear about the projects they work on.",
    startTime: "2026-04-28T12:00:00-04:00",
    endTime: "2026-04-28T14:00:00-04:00",
    timezone: "America/New_York",
    locationName: "Interview Room 4 — Wasserman Union Square",
    locationAddress: wassermanUnionSquare,
    organizerName: "NYU Wasserman Center",
    organizerCompany: "Marshall Wace",
    sourceEmailId: "email_wasserman_01",
  },
  {
    id: "evt_weil_gotshal",
    status: "PENDING",
    confidence: 0.97,
    detectedVia: "LLM",
    kind: "INFO_SESSION",
    title: "An Intro to Careers in Big Law",
    description:
      "Information session for undergraduates of all class years on the path to a career in Big Law. Hosted by Weil, Gotshal & Manges LLP.",
    startTime: "2026-04-28T17:00:00-04:00",
    endTime: "2026-04-28T18:00:00-04:00",
    timezone: "America/New_York",
    locationName: "Presentation Room B — Wasserman Center",
    locationAddress: wassermanUnionSquare,
    organizerName: "NYU Wasserman Center",
    organizerCompany: "Weil, Gotshal & Manges LLP",
    sourceEmailId: "email_wasserman_01",
  },
  {
    id: "evt_changemaker_deadline",
    status: "PENDING",
    confidence: 0.88,
    detectedVia: "KEYWORD",
    kind: "DEADLINE",
    title: "Changemaker Fellowship 2026 — Application Deadline",
    description:
      "Application deadline for the Changemaker Fellowship. Grants up to $5,000 for ~35 students in public service and social impact.",
    startTime: "2026-04-24T23:59:00-04:00",
    timezone: "America/New_York",
    organizerName: "NYU Changemaker Council",
    rsvpLink: "https://wasserman.nyu.edu/changemaker",
    sourceEmailId: "email_wasserman_01",
  },
  {
    id: "evt_quince_dinner",
    status: "PENDING",
    confidence: 0.91,
    detectedVia: "LLM",
    kind: "MEETING",
    title: "Dinner at Quince",
    description: "Private room at Quince. Black tie. RSVP by Monday.",
    startTime: "2026-05-07T19:30:00-07:00",
    endTime: "2026-05-07T22:00:00-07:00",
    timezone: "America/Los_Angeles",
    locationName: "Quince",
    locationAddress: "470 Pacific Ave, San Francisco, CA 94133",
    organizerName: "Sam Chen",
    sourceEmailId: "email_quince_01",
  },
  {
    id: "evt_eng_standup",
    status: "ACCEPTED",
    confidence: 1.0,
    detectedVia: "ICS",
    kind: "MEETING",
    title: "Weekly Eng Standup",
    description: "Recurring weekly team sync.",
    startTime: "2026-04-20T10:00:00-04:00",
    endTime: "2026-04-20T10:30:00-04:00",
    timezone: "America/New_York",
    locationName: "Zoom",
    sourceEmailId: "email_standup_01",
  },
];

export function getEmailById(id: string): MockEmail | undefined {
  return mockEmails.find((e) => e.id === id);
}

export function getPendingEvents(): MockEvent[] {
  return mockEvents.filter((e) => e.status === "PENDING");
}

export function getAcceptedEvents(): MockEvent[] {
  return mockEvents.filter((e) => e.status === "ACCEPTED");
}
