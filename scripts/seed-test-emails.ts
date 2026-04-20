/**
 * Seed the DB with the same mock emails + events the UI demos.
 * Idempotent: wipes the demo user's data before inserting.
 *
 * Run: npm run db:seed
 */
import { PrismaClient } from "@prisma/client";
import { mockEmails, mockEvents } from "../src/lib/mock/events";

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.upsert({
    where: { email: "annie@livingbrands.ai" },
    update: {},
    create: {
      email: "annie@livingbrands.ai",
      name: "Annie Hang",
      timezone: "America/New_York",
    },
  });
  console.log(`✔ User: ${user.email}`);

  await prisma.event.deleteMany({ where: { userId: user.id } });
  await prisma.email.deleteMany({ where: { userId: user.id } });

  for (const email of mockEmails) {
    await prisma.email.create({
      data: {
        id: email.id,
        userId: user.id,
        messageId: `seed:${email.id}`,
        from: email.from,
        subject: email.subject,
        bodyText: email.bodyText,
        receivedAt: new Date(email.receivedAt),
        hasIcs: email.id === "email_standup_01",
        processed: true,
      },
    });
  }
  console.log(`✔ Emails: ${mockEmails.length}`);

  for (const e of mockEvents) {
    const start = new Date(e.startTime);
    await prisma.event.create({
      data: {
        id: e.id,
        userId: user.id,
        emailId: e.sourceEmailId,
        status: e.status,
        confidence: e.confidence,
        detectedVia: e.detectedVia,
        title: e.title,
        description: e.description,
        date: start.toISOString().slice(0, 10),
        startTime: start,
        endTime: e.endTime ? new Date(e.endTime) : null,
        timezone: e.timezone,
        locationName: e.locationName ?? null,
        locationAddress: e.locationAddress ?? null,
        organizerName: e.organizerName ?? null,
        organizerCompany: e.organizerCompany ?? null,
        rsvpLink: e.rsvpLink ?? null,
        dedupHash: `seed:${e.id}`,
      },
    });
  }
  console.log(`✔ Events: ${mockEvents.length}`);

  console.log("\nSeed complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
