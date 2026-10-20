/**
 * Freeze the current DB into an eval fixture.
 *
 * The ingestion pipeline purges emails older than 14 days, so the labelled
 * data an eval needs is destroyed on a rolling basis. This writes it to disk
 * before that happens.
 *
 * The labels are the CURRENT pipeline's output, not human ground truth — so an
 * eval built on this measures *agreement with today's behaviour*, which is what
 * you want when swapping models. It cannot tell you the baseline itself was
 * right; only hand-review can do that.
 *
 *   npx tsx scripts/snapshot-golden-set.ts [outDir]
 *
 * Output contains real email bodies. It is written under eval/, which is
 * gitignored — keep it that way.
 */
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import { classifyKeyword } from "../src/lib/detection/keyword";

const prisma = new PrismaClient();

async function main() {
  const outDir = process.argv[2] ?? "eval/golden";
  mkdirSync(outDir, { recursive: true });

  const emails = await prisma.email.findMany({
    orderBy: { receivedAt: "asc" },
    include: {
      events: {
        select: {
          title: true, description: true, startTime: true, endTime: true,
          timezone: true, locationName: true, locationAddress: true,
          organizerName: true, organizerCompany: true, rsvpLink: true,
          rsvpDeadline: true, attire: true, relevance: true,
          confidence: true, detectedVia: true,
        },
      },
    },
  });

  const cases = emails.map((e) => ({
    id: e.id,
    messageId: e.messageId,
    from: e.from,
    subject: e.subject,
    receivedAt: e.receivedAt.toISOString(),
    hasIcs: e.hasIcs,
    bodyText: e.bodyText ?? "",
    bodyChars: (e.bodyText ?? "").length,
    // Which tier this email reaches — the eval only needs to replay the ones
    // that actually reach the model.
    passesKeywordGate: classifyKeyword(e.subject, e.bodyText ?? "").hit,
    // The label: what the current pipeline extracted.
    expectedEvents: e.events,
  }));

  const llmCases = cases.filter((c) => c.passesKeywordGate);
  const positives = llmCases.filter((c) => c.expectedEvents.length > 0);

  const meta = {
    snapshotAt: new Date().toISOString(),
    baselineModel: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
    totalEmails: cases.length,
    emailWindow: {
      from: cases[0]?.receivedAt ?? null,
      to: cases[cases.length - 1]?.receivedAt ?? null,
    },
    llmTierCases: llmCases.length,
    positiveCases: positives.length,
    totalExpectedEvents: cases.reduce((n, c) => n + c.expectedEvents.length, 0),
  };

  writeFileSync(join(outDir, "cases.json"), JSON.stringify(cases, null, 2));
  writeFileSync(join(outDir, "meta.json"), JSON.stringify(meta, null, 2));

  console.table(meta);
  console.log(`\nwrote ${cases.length} cases -> ${outDir}/cases.json`);
  if (positives.length < 25) {
    console.log(
      `\n⚠️  only ${positives.length} positive case(s). One miss moves recall by ` +
        `${(100 / positives.length).toFixed(0)} points — too coarse to decide a model swap. ` +
        `Enlarge the set before trusting it.`
    );
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
