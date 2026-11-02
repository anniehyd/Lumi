/**
 * Create (or refresh) the account a demo deployment shows.
 *
 * Demo mode (no GOOGLE_CLIENT_ID) serves the rows of the user named by
 * LUMI_DEMO_USER_EMAIL. This makes that user exist, marks onboarding done so
 * the dashboard opens directly, sets a profile for relevance scoring, and
 * gives them a fixed forwarding token so mail can be pushed in through
 * POST /api/ingest/inbound exactly as a Postmark forward would arrive.
 *
 *   DEMO_EMAIL=demo@lumi.local DEMO_FORWARDING_TOKEN=<32 hex> npx tsx scripts/seed-demo-user.ts
 */
import { PrismaClient } from "@prisma/client";
import type { UserProfile } from "../src/lib/profile";

const prisma = new PrismaClient();

const email = process.env.DEMO_EMAIL?.trim();
const token = process.env.DEMO_FORWARDING_TOKEN?.trim();
if (!email || !token || !/^[a-f0-9]{32}$/.test(token)) {
  console.error("DEMO_EMAIL and a 32-hex DEMO_FORWARDING_TOKEN are required");
  process.exit(1);
}

const profile: UserProfile = {
  role: "cs",
  school: "NYU",
  gradYear: "2028",
  interests: [
    "Internship deadlines",
    "Info sessions",
    "Recruiting events",
    "Career fairs",
    "Hackathons",
    "Startup events",
    "Tech talks",
  ],
  note:
    "CS junior recruiting for software engineering and product internships (tech and finance). " +
    "Never let me miss an application deadline, an info session or coffee chat with a firm I could apply to, " +
    "or a startup/founder event at NYU. Club socials and general campus announcements matter less.",
};

async function main() {
  const user = await prisma.user.upsert({
    where: { email },
    update: { forwardingToken: token, profile, onboardedAt: new Date(), name: "Annie" },
    create: { email, name: "Annie", forwardingToken: token, profile, onboardedAt: new Date() },
    select: { id: true, email: true },
  });
  console.log(`demo user ready: ${user.email} (${user.id})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
