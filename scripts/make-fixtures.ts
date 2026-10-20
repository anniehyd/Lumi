/**
 * Turn the golden-set snapshot into the fixture file compare-extractors.ts eats.
 *
 *   npx tsx scripts/snapshot-golden-set.ts     # freeze the DB  (free)
 *   npx tsx scripts/make-fixtures.ts           # shape it       (free)
 *   npx tsx scripts/compare-extractors.ts fixtures/emails.json   # costs money
 *
 * Only emails that pass the keyword gate are included — those are the ones
 * that actually reach the model, so they are the only ones an extractor A/B
 * can disagree about. Positives (the baseline found events) come first and are
 * never dropped by --limit, because they carry all the recall signal; the
 * negatives that follow are what catch a model inventing events.
 *
 * Output holds real email bodies — fixtures/ is gitignored, keep it that way.
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

type Case = {
  from: string;
  subject: string;
  receivedAt: string;
  bodyText: string;
  bodyChars: number;
  passesKeywordGate: boolean;
  expectedEvents: unknown[];
};

const inPath = process.argv[2] ?? "eval/golden/cases.json";
const outDir = "fixtures";
const limit = Number(process.env.LIMIT ?? 0);

const cases = JSON.parse(readFileSync(inPath, "utf8")) as Case[];
const gated = cases.filter((c) => c.passesKeywordGate);
const positives = gated.filter((c) => c.expectedEvents.length > 0);
const negatives = gated.filter((c) => c.expectedEvents.length === 0);

const picked = [...positives, ...negatives].slice(0, limit > 0 ? limit : undefined);

mkdirSync(outDir, { recursive: true });
writeFileSync(
  join(outDir, "emails.json"),
  JSON.stringify(
    picked.map((c) => ({
      subject: c.subject,
      from: c.from,
      bodyText: c.bodyText,
      receivedAt: c.receivedAt,
    })),
    null,
    2
  )
);

// The baseline's stored output, keyed by subject — so a future harness can
// score against it instead of paying to re-run the baseline on every A/B.
writeFileSync(
  join(outDir, "expected.json"),
  JSON.stringify(
    picked.map((c) => ({ subject: c.subject, expectedEvents: c.expectedEvents })),
    null,
    2
  )
);

const chars = picked.reduce((n, c) => n + c.bodyChars, 0);
const inTok = Math.round(chars / 4) + picked.length * 1100; // bodies + static prefix
const outTok = picked.length * 500;
const cost = (m: { i: number; o: number }) => (inTok / 1e6) * m.i + (outTok / 1e6) * m.o;

console.log(`fixtures/emails.json — ${picked.length} emails ` +
  `(${positives.length} positive, ${picked.length - positives.length} negative)`);
console.log(`~${inTok.toLocaleString()} input + ~${outTok.toLocaleString()} output tokens per model pass\n`);
console.log("estimated cost of ONE pass over this fixture:");
for (const [name, m] of [
  ["claude-sonnet-5", { i: 2.0, o: 10.0 }],
  ["claude-haiku-4-5", { i: 1.0, o: 5.0 }],
  ["deepseek-v4.1-flash", { i: 0.15, o: 0.6 }],
  ["qwen3.7-flash", { i: 0.03, o: 0.13 }],
] as const) {
  console.log(`  ${name.padEnd(22)} $${cost(m).toFixed(4)}`);
}
console.log(
  `\ncompare-extractors.ts calls BOTH models, so a baseline+candidate run costs the sum of two rows.`
);
