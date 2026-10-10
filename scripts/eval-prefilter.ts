/**
 * Replay the golden set through the pre-filter, offline. Free: no model, no
 * network, no database.
 *
 *   npx tsx scripts/eval-prefilter.ts [eval/golden/cases.json]
 *
 * Answers two questions for every rule in src/lib/detection/prefilter.ts:
 *   - how many model calls would it have saved over the snapshot window?
 *   - did it drop any email the pipeline had found events in? (must be 0)
 *
 * The labels are the pipeline's own past output, not human ground truth — so
 * "0 positives lost" means "no regression against what Lumi used to find",
 * not "no event is ever missed". Emails are replayed oldest-first so the
 * stateful rules (duplicate, sender history) see the history they would have
 * had in production.
 *
 * Prints counts and sender domains only, never subjects or bodies.
 */
import { readFileSync } from "fs";
import { classifyKeyword } from "../src/lib/detection/keyword";
import {
  compactBody,
  contentHash,
  isBulk,
  prefilter,
  senderAddress,
  shouldMuteSender,
  type SenderHistory,
  type SkipReason,
} from "../src/lib/detection/prefilter";

type Case = {
  from: string;
  subject: string;
  receivedAt: string;
  bodyText: string;
  hasIcs: boolean;
  expectedEvents: { detectedVia: string }[];
};

const path = process.argv[2] ?? "eval/golden/cases.json";
const cases = (JSON.parse(readFileSync(path, "utf8")) as Case[]).sort((a, b) =>
  a.receivedAt.localeCompare(b.receivedAt)
);

// Rough chars→tokens conversion, used only to turn the compaction ratio into
// a dollar estimate in docs/COST.md. Real counts come from LlmUsage.
const CHARS_PER_TOKEN = 4;

const seenHashes = new Set<string>();
const senders = new Map<string, SenderHistory>();
const skipped: Record<SkipReason, number> = {
  survey: 0,
  no_temporal: 0,
  duplicate: 0,
  unchanged_thread: 0,
  sender_history: 0,
};
const lost: { reason: SkipReason; domain: string; events: number }[] = [];

let gated = 0;
let sent = 0;
let positivesBefore = 0;
let positivesAfter = 0;
let eventsBefore = 0;
let eventsAfter = 0;
let charsBefore = 0;
let charsAfter = 0;
let truncated = 0;

for (const c of cases) {
  if (!classifyKeyword(c.subject, c.bodyText).hit) continue;
  gated++;
  charsBefore += c.bodyText.length;

  const llmEvents = c.expectedEvents.filter((e) => e.detectedVia === "LLM").length;
  if (llmEvents > 0) {
    positivesBefore++;
    eventsBefore += llmEvents;
  }

  const drop = (reason: SkipReason) => {
    skipped[reason]++;
    if (llmEvents > 0) {
      lost.push({ reason, domain: senderAddress(c.from).split("@")[1] ?? "?", events: llmEvents });
    }
  };

  const verdict = prefilter(c);
  if (!verdict.pass) {
    drop(verdict.reason);
    continue;
  }

  const hash = contentHash(c.from, c.subject, c.bodyText);
  if (seenHashes.has(hash)) {
    drop("duplicate");
    continue;
  }
  seenHashes.add(hash);

  const sender = senderAddress(c.from);
  const history = senders.get(sender) ?? { llmCalls: 0, eventsFound: 0, skippedSinceProbe: 0 };
  senders.set(sender, history);
  if (isBulk(c.bodyText) && shouldMuteSender(history)) {
    history.skippedSinceProbe++;
    drop("sender_history");
    continue;
  }

  // This one reaches the model.
  sent++;
  history.llmCalls++;
  history.eventsFound += llmEvents;
  history.skippedSinceProbe = 0;
  if (llmEvents > 0) {
    positivesAfter++;
    eventsAfter += llmEvents;
  }
  const compact = compactBody(c.bodyText);
  charsAfter += compact.text.length;
  if (compact.truncated) truncated++;
}

const pct = (n: number, d: number) => (d === 0 ? "n/a" : `${((n / d) * 100).toFixed(1)}%`);
const days =
  cases.length > 1
    ? (Date.parse(cases[cases.length - 1].receivedAt) - Date.parse(cases[0].receivedAt)) / 86_400_000
    : 0;

console.log(`\nPre-filter replay — ${path}`);
console.log(`${cases.length} emails over ${days.toFixed(1)} days\n`);
console.log(`passed keyword gate (model calls BEFORE)   ${gated}`);
for (const [reason, n] of Object.entries(skipped)) {
  if (n) console.log(`  skipped: ${reason.padEnd(18)}            ${String(n).padStart(3)}`);
}
console.log(`model calls AFTER                          ${sent}   (${pct(gated - sent, gated)} fewer)`);
console.log(`\nemails with LLM-found events kept          ${positivesAfter} / ${positivesBefore}`);
console.log(`LLM-found events kept                      ${eventsAfter} / ${eventsBefore}`);
console.log(
  `\nbody chars sent to the model               ${charsBefore.toLocaleString()} → ${charsAfter.toLocaleString()}   (${pct(charsBefore - charsAfter, charsBefore)} fewer)`
);
console.log(
  `≈ input tokens (bodies only, ${CHARS_PER_TOKEN} chars/token)  ${Math.round(charsBefore / CHARS_PER_TOKEN).toLocaleString()} → ${Math.round(charsAfter / CHARS_PER_TOKEN).toLocaleString()}`
);
console.log(`emails cut at the size ceiling             ${truncated}`);

if (lost.length) {
  console.log(`\n✗ ${lost.length} event-bearing email(s) would be DROPPED:`);
  for (const l of lost) console.log(`    ${l.reason.padEnd(16)} ${l.domain}  (${l.events} event(s))`);
  process.exit(1);
}
console.log(`\n✓ no event-bearing email dropped\n`);
