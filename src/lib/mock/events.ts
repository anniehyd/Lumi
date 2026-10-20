// Mock data derived from a real NYU Wasserman Center newsletter.
// Demonstrates Lumi's hardest case: one email → multiple events +
// deadlines + non-event announcements to filter out.

export type EventStatus = "PENDING" | "ACCEPTED" | "MAYBE" | "DECLINED";
export type DetectionMethod = "ICS" | "SCHEMA_ORG" | "KEYWORD" | "LLM" | "MANUAL";
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
  relevance?: number; // 1..5 — fit to the user's interests
  conflictTitle?: string; // overlapping Google Calendar event, if any
  summary?: string; // one sentence on what the event is, shown on the card
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
    bodyText: "A Google Calendar invitation. Accepting it in Gmail already put it on your calendar; Lumi leaves it alone.",
    extractedEventIds: [],
    ignoredSnippets: ["Google Calendar invitation you already accepted (skipped: own_calendar)"],
  },
  {
    id: "email_technyu_week",
    from: "hello@techatnyu.org",
    fromName: "Tech@NYU",
    subject: "5 events in 6 days: Figma HackDay, Buildathon, and more",
    receivedAt: daysAgo(1, 10),
    preview: "Figma HackDay Saturday, the fall Buildathon kicks off Thursday, plus a design crit, an intro to Rust, and office hours.",
    bodyText: `Hey builders,

It's a packed week. Here's everything:

Figma HackDay
Saturday, 10:00 AM – 6:00 PM, Leslie eLab, 16 Washington Place
A one-day design sprint with Figma designers on site. Teams of 3–4, prizes for the best prototype. RSVP on Luma (spots are limited).

Fall Buildathon kickoff
Thursday, 6:00 PM – 8:00 PM, Kimmel 405
Form a team and ship something in 48 hours. Sponsored by Vercel and Supabase; mentors from both will be in the room.

Design crit
Wednesday, 7:00 PM, 370 Jay Street, room 1201
Bring a screen, get feedback.

Intro to Rust
Monday, 6:30 PM, online
Our systems track runs through ownership and borrowing in 90 minutes.

Office hours
Every Tuesday, 4–6 PM, Bobst LL1. No RSVP needed.`,
    extractedEventIds: ["evt_figma_hackday", "evt_buildathon", "evt_design_crit"],
    ignoredSnippets: ["Office hours (recurring, no date in the email)", "Intro to Rust (online, outside the inbox window)"],
  },
  {
    id: "email_qfs_optiver",
    from: "qfs@nyu.edu",
    fromName: "NYU Quant Finance Society",
    subject: "Optiver Info Session — Wednesday 7 PM, Paulson Auditorium",
    receivedAt: daysAgo(0, 9),
    preview: "Optiver is on campus Wednesday to talk about their trading and software internships. Pizza provided.",
    bodyText: `QFS members,

Optiver, the Amsterdam market maker, is hosting an info session on campus this Wednesday at 7:00 PM in Paulson Auditorium (Tisch Hall, 40 West 4th Street). They are recruiting for software engineering and quantitative trading internships for summer 2027. Bring questions; recruiters stay after for a Q&A.

Pizza provided. RSVP so we can get the headcount right.

Also this week: Fixed Income Intro (Tuesday, 6 PM, T-201) and Morgan Stanley Sales & Trading overview (Thursday, 5 PM, KMC 2-60).`,
    extractedEventIds: ["evt_optiver", "evt_fixed_income", "evt_morgan_stanley"],
    ignoredSnippets: [],
  },
  {
    id: "email_supermomos",
    from: "invites@supermomos.com",
    fromName: "Supermomos",
    subject: "Elaine invited you: Design and Research in the Age of AI",
    receivedAt: daysAgo(1, 19),
    preview: "Elaine (Meta) invited you to Design and Research in the Age of AI, Nov 6, 6:00–8:30 PM.",
    bodyText: `Elaine from Meta invited you to an event.

Design and Research in the Age of AI
Thursday, November 6, 6:00 PM – 8:30 PM
Betaworks, 29 Little West 12th Street, New York

A panel with design and research leads from Meta, Figma and Anthropic on how AI is changing product research, followed by drinks. Limited to 80 people; accept the invite to hold your spot.`,
    extractedEventIds: ["evt_design_ai"],
    ignoredSnippets: [],
  },
  {
    id: "email_luma_cryptomondays",
    from: "noreply@lu.ma",
    fromName: "Luma · CryptoMondays NYC",
    subject: "Goldman ➡️ Bitcoin ➡️ Federal Prison: a fireside chat",
    receivedAt: daysAgo(3, 12),
    preview: "CryptoMondays NYC: a fireside chat with a former Goldman trader, Monday 6:30 PM.",
    bodyText: `CryptoMondays NYC

Goldman ➡️ Bitcoin ➡️ Federal Prison
Monday, 6:30 PM – 9:00 PM
The Yard, 157 13th Street, Brooklyn

A fireside chat with a former Goldman Sachs trader on the trade that went wrong. Networking before and after. Free with RSVP.`,
    extractedEventIds: ["evt_cryptomondays"],
    ignoredSnippets: [],
  },
  {
    id: "email_svs_tiffany",
    from: "svs@stern.nyu.edu",
    fromName: "Stern Venture Society",
    subject: "Fireside chat with Tiffany Luck (NEA) — this Thursday",
    receivedAt: daysAgo(0, 15),
    preview: "Tiffany Luck, partner at NEA, on what seed-stage investors look for. Thursday 6 PM, KMC 1-70.",
    bodyText: `SVS presents a fireside chat with Tiffany Luck, Partner at New Enterprise Associates (NEA).

Thursday, 6:00 PM – 7:15 PM
Kaufman Management Center, Room 1-70

Tiffany invests in early-stage consumer and software companies. She will talk about what NEA looks for at seed, how founders should run a first meeting, and take questions. Open to all NYU students; registration required through the SVS Engage page.`,
    extractedEventIds: ["evt_tiffany_luck"],
    ignoredSnippets: [],
  },
  {
    id: "email_isaw_invite",
    from: "calendar-notification@google.com",
    fromName: "Google Calendar",
    subject: "Updated invitation: ISAW/Annie projects @ Mon 1pm – 2pm (Zoom)",
    receivedAt: daysAgo(4, 11),
    preview: "Tom Elliott updated this event: a Zoom link was added. Same time, Monday 1–2 PM.",
    bodyText: "A Google Calendar update for a meeting you already accepted. Google refreshed your calendar itself; Lumi does not make a card for it.",
    extractedEventIds: [],
    ignoredSnippets: ["Google Calendar notice for an event already on your calendar (skipped: own_calendar)"],
  },
  {
    id: "email_codesignal",
    from: "no-reply@codesignal.com",
    fromName: "CodeSignal",
    subject: "Reminder: your Persona assessment expires in 3 days",
    receivedAt: daysAgo(0, 8),
    preview: "Persona has invited you to complete the General Coding Assessment. The link expires Friday at 11:59 PM.",
    bodyText: `Hi Annie,

This is a reminder that Persona has invited you to complete the General Coding Assessment as part of your application for the Software Engineering Intern role.

The assessment takes about 70 minutes and must be completed by Friday at 11:59 PM ET. The link will expire after that.

Start assessment: https://assess.personahq.dev/start`,
    extractedEventIds: ["evt_codesignal_deadline"],
    ignoredSnippets: [],
  },
  {
    id: "email_resy",
    from: "reservations@resy.com",
    fromName: "Resy",
    subject: "Confirmed: Singapore Social, Saturday at 6:00 PM for 2",
    receivedAt: daysAgo(1, 13),
    preview: "Your reservation at Singapore Social is confirmed. Saturday, 6:00 PM, party of 2.",
    bodyText: "A receipt for a table you booked yourself. It carries schema.org Reservation markup, so without the gate it would have become a card; Lumi skips it.",
    extractedEventIds: [],
    ignoredSnippets: ["Reservation confirmation for a booking you made (skipped: reservation)"],
  },
  {
    id: "email_handshake_msg",
    from: "handshake@notifications.joinhandshake.com",
    fromName: "Handshake",
    subject: "Madison Square Garden Entertainment is recruiting on campus",
    receivedAt: daysAgo(5, 10),
    preview: "MSG Entertainment: Early Careers Showcase, next Tuesday 5–6:30 PM, Wasserman. Register on Handshake.",
    bodyText: `Madison Square Garden Entertainment is coming to NYU.

Early Careers Showcase
Tuesday, 5:00 PM – 6:30 PM
Wasserman Center, Presentation Room A

Hear from the technology, marketing and operations teams about summer internships, then talk to recruiters. Register on Handshake.`,
    extractedEventIds: ["evt_msg_showcase"],
    ignoredSnippets: [],
  },
  {
    id: "email_calvin_klein",
    from: "news@calvinklein.com",
    fromName: "Calvin Klein",
    subject: "You're invited: in-store bra fitting event",
    receivedAt: daysAgo(2, 16),
    preview: "Join us in store this weekend for a complimentary fitting event and 20% off.",
    bodyText: "Promotional mail. The pre-filter stops it before any model call: a retail sender with a 'Pink Out'-style event that is marketing, not an invitation.",
    extractedEventIds: [],
    ignoredSnippets: ["Retail promotion phrased as an event", "Pure Barre 'Pink Out' (same rule)", "Posh terms-of-service update (no date)"],
  },
  {
    id: "email_uxui_deleted",
    from: "calendar-notification@google.com",
    fromName: "Google Calendar",
    subject: "Canceled event: UXUI meeting Annie & Brianna",
    receivedAt: daysAgo(2, 9),
    preview: "Brianna canceled this event.",
    bodyText: "A cancellation carries METHOD:CANCEL. Lumi removes the matching event instead of creating one.",
    extractedEventIds: [],
    ignoredSnippets: ["Cancellation of an existing event (removed, not added)"],
  },
];

const wassermanUnionSquare = "726 Broadway, New York, NY 10003";

// Demo dates are relative to "now" so the feed (future events only) never goes stale.
function daysAgo(days: number, hour: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

function inDays(days: number, hour: number, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

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
    startTime: inDays(2, 12),
    endTime: inDays(2, 14),
    relevance: 5,
    conflictTitle: "Linear Algebra Recitation",
    summary:
      "Marshall Wace is a London hedge fund with a large technology team; this coffee chat is where their developers talk to students about internships.",
    rsvpLink: "https://mwtech-campus.events/nyu/coffee-chats",
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
    startTime: inDays(3, 17),
    endTime: inDays(3, 18),
    relevance: 2,
    summary:
      "Weil, Gotshal & Manges is a global law firm; this session walks through what a Big Law career path looks like, open to every class year.",
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
    startTime: inDays(5, 23, 59),
    relevance: 3,
    summary:
      "NYU's Changemaker Fellowship funds about 35 students with grants up to $5,000 for public-service projects; this is the application deadline.",
    timezone: "America/New_York",
    organizerName: "NYU Changemaker Council",
    rsvpLink: "https://changemaker.nyu-apply.org/2026",
    sourceEmailId: "email_wasserman_01",
  },
  {
    id: "evt_quince_dinner",
    status: "DECLINED",
    confidence: 0.91,
    detectedVia: "LLM",
    kind: "MEETING",
    title: "Dinner at Quince",
    description: "Private room at Quince. Black tie. RSVP by Monday.",
    startTime: inDays(8, 19, 30),
    endTime: inDays(8, 22),
    relevance: 1,
    summary: "A black-tie dinner Sam is hosting in a private room at Quince; reply by Monday so he can confirm the table.",
    timezone: "America/Los_Angeles",
    locationName: "Quince",
    locationAddress: "470 Pacific Ave, San Francisco, CA 94133",
    organizerName: "Sam Chen",
    sourceEmailId: "email_quince_01",
  },
  {
    id: "evt_figma_hackday",
    status: "PENDING",
    confidence: 0.96,
    detectedVia: "LLM",
    kind: "MEETING",
    title: "Figma HackDay",
    description: "A one-day design sprint with Figma designers on site. Teams of 3–4, prizes for the best prototype.",
    summary: "Figma makes the design tool most product teams use; this is a one-day sprint where their designers coach student teams and judge prototypes.",
    startTime: inDays(6, 10),
    endTime: inDays(6, 18),
    relevance: 5,
    timezone: "America/New_York",
    locationName: "Leslie eLab",
    locationAddress: "16 Washington Place, New York, NY 10003",
    organizerName: "Tech@NYU",
    organizerCompany: "Figma",
    rsvpLink: "https://hackday.figmacampus.co/nyu",
    sourceEmailId: "email_technyu_week",
  },
  {
    id: "evt_buildathon",
    status: "ACCEPTED",
    confidence: 0.95,
    detectedVia: "LLM",
    kind: "MEETING",
    title: "Fall Buildathon kickoff",
    description: "Form a team and ship something in 48 hours. Sponsored by Vercel and Supabase; mentors from both in the room.",
    summary: "A 48-hour build sprint run by Tech@NYU; the kickoff is where teams form, and engineers from Vercel and Supabase mentor through the weekend.",
    startTime: inDays(4, 18),
    endTime: inDays(4, 20),
    relevance: 5,
    conflictTitle: "CS-UA 310 Office Hours",
    timezone: "America/New_York",
    locationName: "Kimmel 405",
    locationAddress: "60 Washington Square South, New York, NY 10012",
    organizerName: "Tech@NYU",
    sourceEmailId: "email_technyu_week",
  },
  {
    id: "evt_design_crit",
    status: "DECLINED",
    confidence: 0.82,
    detectedVia: "LLM",
    kind: "MEETING",
    title: "Design crit",
    description: "Bring a screen, get feedback.",
    summary: "An informal feedback session: bring a screen you are working on and other Tech@NYU members critique it.",
    startTime: inDays(3, 19),
    endTime: inDays(3, 20),
    relevance: 3,
    timezone: "America/New_York",
    locationName: "370 Jay Street, room 1201",
    organizerName: "Tech@NYU",
    sourceEmailId: "email_technyu_week",
  },
  {
    id: "evt_optiver",
    status: "PENDING",
    confidence: 0.97,
    detectedVia: "LLM",
    kind: "INFO_SESSION",
    title: "Optiver Info Session",
    description: "Recruiting for software engineering and quantitative trading internships, summer 2027. Q&A with recruiters after.",
    summary: "Optiver is an Amsterdam market maker that hires software and quant interns; this session is their on-campus pitch, with recruiters staying for questions.",
    startTime: inDays(3, 19),
    endTime: inDays(3, 20, 30),
    relevance: 4,
    timezone: "America/New_York",
    locationName: "Paulson Auditorium, Tisch Hall",
    locationAddress: "40 West 4th Street, New York, NY 10012",
    organizerName: "NYU Quant Finance Society",
    organizerCompany: "Optiver",
    rsvpLink: "https://nyu.optivercampus.events/info-session",
    sourceEmailId: "email_qfs_optiver",
  },
  {
    id: "evt_fixed_income",
    status: "DECLINED",
    confidence: 0.86,
    detectedVia: "LLM",
    kind: "MEETING",
    title: "Fixed Income Intro",
    description: "QFS member session introducing fixed income.",
    summary: "A QFS teaching session on how bonds and rates work, aimed at members new to fixed income.",
    startTime: inDays(2, 18),
    endTime: inDays(2, 19),
    relevance: 2,
    timezone: "America/New_York",
    locationName: "Tisch Hall T-201",
    organizerName: "NYU Quant Finance Society",
    sourceEmailId: "email_qfs_optiver",
  },
  {
    id: "evt_morgan_stanley",
    status: "DECLINED",
    confidence: 0.9,
    detectedVia: "LLM",
    kind: "INFO_SESSION",
    title: "Morgan Stanley Sales & Trading overview",
    description: "Overview of the Sales & Trading division and its summer analyst program.",
    summary: "Morgan Stanley is a global investment bank; this is an overview of its Sales & Trading floor and the summer analyst track.",
    startTime: inDays(4, 17),
    endTime: inDays(4, 18),
    relevance: 2,
    timezone: "America/New_York",
    locationName: "KMC 2-60",
    organizerName: "NYU Quant Finance Society",
    organizerCompany: "Morgan Stanley",
    sourceEmailId: "email_qfs_optiver",
  },
  {
    id: "evt_design_ai",
    status: "PENDING",
    confidence: 0.98,
    detectedVia: "SCHEMA_ORG",
    kind: "MEETING",
    title: "Design and Research in the Age of AI",
    description: "A panel with design and research leads from Meta, Figma and Anthropic, followed by drinks. Limited to 80 people.",
    summary: "Supermomos runs invite-only industry meetups; this one is a panel of design and research leads from Meta, Figma and Anthropic on AI in product research, then drinks.",
    startTime: inDays(18, 18),
    endTime: inDays(18, 20, 30),
    relevance: 4,
    timezone: "America/New_York",
    locationName: "Betaworks",
    locationAddress: "29 Little West 12th Street, New York, NY 10014",
    organizerName: "Elaine (Meta) via Supermomos",
    organizerCompany: "Supermomos",
    rsvpLink: "https://aidesignnight.nyc/rsvp",
    sourceEmailId: "email_supermomos",
  },
  {
    id: "evt_cryptomondays",
    status: "DECLINED",
    confidence: 0.93,
    detectedVia: "SCHEMA_ORG",
    kind: "MEETING",
    title: "Goldman ➡️ Bitcoin ➡️ Federal Prison",
    description: "A fireside chat with a former Goldman Sachs trader on the trade that went wrong. Networking before and after.",
    summary: "CryptoMondays is a weekly crypto meetup in Brooklyn; this edition is a fireside chat with a former Goldman trader, plus networking.",
    startTime: inDays(7, 18, 30),
    endTime: inDays(7, 21),
    relevance: 2,
    timezone: "America/New_York",
    locationName: "The Yard",
    locationAddress: "157 13th Street, Brooklyn, NY 11215",
    organizerName: "CryptoMondays NYC",
    rsvpLink: "https://cryptomondays.nyc/rsvp",
    sourceEmailId: "email_luma_cryptomondays",
  },
  {
    id: "evt_tiffany_luck",
    status: "ACCEPTED",
    confidence: 0.95,
    detectedVia: "LLM",
    kind: "MEETING",
    title: "Fireside chat with Tiffany Luck (NEA)",
    description: "What NEA looks for at seed, how founders should run a first meeting, and Q&A.",
    summary: "NEA is one of the largest venture firms; Tiffany Luck, a partner there, talks about what seed-stage investors want and how to run a first meeting.",
    startTime: inDays(4, 18),
    endTime: inDays(4, 19, 15),
    relevance: 4,
    timezone: "America/New_York",
    locationName: "Kaufman Management Center, Room 1-70",
    locationAddress: "44 West 4th Street, New York, NY 10012",
    organizerName: "Stern Venture Society",
    organizerCompany: "NEA",
    rsvpLink: "https://rsvp.sternventures.club/tiffany-luck",
    sourceEmailId: "email_svs_tiffany",
  },
  {
    id: "evt_codesignal_deadline",
    status: "PENDING",
    confidence: 0.92,
    detectedVia: "LLM",
    kind: "DEADLINE",
    title: "Persona — General Coding Assessment due",
    description: "CodeSignal assessment for the Software Engineering Intern application; about 70 minutes; link expires Friday 11:59 PM ET.",
    summary: "Persona is an identity-verification startup; this is the CodeSignal assessment for their software engineering internship, about 70 minutes, and the link expires at the deadline.",
    startTime: inDays(4, 23, 59),
    relevance: 5,
    timezone: "America/New_York",
    organizerName: "CodeSignal",
    organizerCompany: "Persona",
    rsvpLink: "https://assess.personahq.dev/start",
    sourceEmailId: "email_codesignal",
  },
  {
    id: "evt_msg_showcase",
    status: "DECLINED",
    confidence: 0.94,
    detectedVia: "LLM",
    kind: "INFO_SESSION",
    title: "MSG Entertainment Early Careers Showcase",
    description: "Technology, marketing and operations teams on summer internships, then recruiter conversations.",
    summary: "Madison Square Garden Entertainment runs the Garden, Radio City and the Sphere; this showcase is their technology, marketing and operations teams pitching summer internships.",
    startTime: inDays(9, 17),
    endTime: inDays(9, 18, 30),
    relevance: 3,
    timezone: "America/New_York",
    locationName: "Wasserman Center, Presentation Room A",
    locationAddress: wassermanUnionSquare,
    organizerName: "Handshake",
    organizerCompany: "MSG Entertainment",
    rsvpLink: "https://earlycareers.msg-showcase.events",
    sourceEmailId: "email_handshake_msg",
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
