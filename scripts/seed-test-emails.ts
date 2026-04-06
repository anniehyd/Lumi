/**
 * Seed script for development.
 * Creates a test user and sample events to preview the dashboard.
 *
 * Usage: npm run db:seed
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SAMPLE_EVENTS = [
  {
    status: "PENDING" as const,
    confidence: 0.97,
    detectedVia: "LLM" as const,
    title: "Acme Corp Product Launch",
    description:
      "Join CEO Sarah Chen for the keynote unveiling our next-generation platform, followed by live demos and networking. Complimentary drinks and canapés.",
    date: "2026-03-28",
    startTime: new Date("2026-03-28T23:00:00Z"), // 6 PM EST
    endTime: new Date("2026-04-29T02:00:00Z"), // 9 PM EST
    timezone: "America/New_York",
    isAllDay: false,
    locationType: "PHYSICAL" as const,
    locationName: "The Glasshouse",
    locationAddress: "500 W 36th St, New York, NY 10018",
    organizerName: "Sarah Chen",
    organizerEmail: "sarah@acmecorp.com",
    organizerCompany: "Acme Corp",
    attire: "Business Casual",
    rsvpLink: "https://acmecorp.com/rsvp/launch-2026",
    rsvpDeadline: new Date("2026-03-25T04:59:59Z"),
    dedupHash: "seed_acme_launch",
  },
  {
    status: "PENDING" as const,
    confidence: 0.92,
    detectedVia: "KEYWORD" as const,
    title: "Design Systems Meetup #42",
    description:
      "Monthly meetup for design system practitioners. This month: accessibility testing strategies.",
    date: "2026-04-03",
    startTime: new Date("2026-04-03T23:30:00Z"),
    endTime: new Date("2026-04-04T01:30:00Z"),
    timezone: "America/New_York",
    isAllDay: false,
    locationType: "HYBRID" as const,
    locationName: "WeWork SoHo",
    locationAddress: "154 Grand St, New York, NY 10013",
    virtualUrl: "https://zoom.us/j/123456789",
    organizerName: "NYC Design Systems",
    organizerEmail: "events@nycdesignsystems.org",
    attire: null,
    rsvpLink: "https://meetup.com/nyc-ds/42",
    dedupHash: "seed_ds_meetup_42",
  },
  {
    status: "PENDING" as const,
    confidence: 0.85,
    detectedVia: "LLM" as const,
    title: "Q2 Strategy Offsite",
    description:
      "All-hands strategy session. Please review the pre-read deck before attending.",
    date: "2026-04-10",
    startTime: new Date("2026-04-10T13:00:00Z"),
    endTime: new Date("2026-04-10T21:00:00Z"),
    timezone: "America/New_York",
    isAllDay: false,
    locationType: "PHYSICAL" as const,
    locationName: "Hudson Valley Lodge",
    locationAddress: "200 Mountain Rd, Cold Spring, NY 10516",
    organizerName: "Jamie Park",
    organizerEmail: "jamie@yourcompany.com",
    attire: "Casual",
    dedupHash: "seed_q2_offsite",
  },
  {
    status: "MAYBE" as const,
    confidence: 0.78,
    detectedVia: "LLM" as const,
    title: "AI Research Paper Reading Group",
    description: "This week we're reading 'Scaling Laws for Neural Language Models'. Snacks provided.",
    date: "2026-03-14",
    startTime: new Date("2026-03-14T22:00:00Z"),
    endTime: new Date("2026-03-14T23:30:00Z"),
    timezone: "America/New_York",
    isAllDay: false,
    locationType: "VIRTUAL" as const,
    virtualUrl: "https://meet.google.com/abc-defg-hij",
    virtualPlatform: "Google Meet",
    organizerName: "Dr. Alex Rivera",
    organizerEmail: "arivera@university.edu",
    dedupHash: "seed_ai_reading",
  },
  {
    status: "ACCEPTED" as const,
    confidence: 0.99,
    detectedVia: "ICS" as const,
    title: "Annual Team Dinner",
    description: "End-of-quarter celebration dinner. Partners welcome!",
    date: "2026-03-21",
    startTime: new Date("2026-03-22T00:00:00Z"),
    endTime: new Date("2026-03-22T03:00:00Z"),
    timezone: "America/New_York",
    isAllDay: false,
    locationType: "PHYSICAL" as const,
    locationName: "Eleven Madison Park",
    locationAddress: "11 Madison Ave, New York, NY 10010",
    organizerName: "HR Team",
    organizerEmail: "hr@yourcompany.com",
    attire: "Smart Casual",
    calendarEventId: "gcal_fake_123",
    dedupHash: "seed_team_dinner",
  },
];

async function seed() {
  console.log("Seeding Lumi database...");

  // Create or find test user
  const user = await prisma.user.upsert({
    where: { email: "dev@lumi.test" },
    update: {},
    create: {
      email: "dev@lumi.test",
      name: "Lumi Dev",
      timezone: "America/New_York",
    },
  });

  console.log(`User: ${user.email} (${user.id})`);

  // Create sample events
  for (const eventData of SAMPLE_EVENTS) {
    await prisma.event.upsert({
      where: { dedupHash: eventData.dedupHash },
      update: {},
      create: {
        userId: user.id,
        ...eventData,
      },
    });
  }

  console.log(`Created ${SAMPLE_EVENTS.length} sample events`);
  console.log("Done!");
}

seed()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
