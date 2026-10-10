/**
 * A/B the extraction LLM on real emails before cutting production over.
 *
 *   npx tsx scripts/compare-extractors.ts fixtures/emails.json
 *
 * Fixture format — a JSON array of emails, ideally ~30 that already passed the
 * keyword gate in production, with a couple of known-empty ones included so a
 * model that hallucinates events gets caught:
 *
 *   [{ "subject": "...", "from": "...", "bodyText": "...", "receivedAt": "2026-09-01T12:00:00Z" }]
 *
 * Reports, per model: events found, agreement with the baseline on event
 * count, mean relevance delta, tokens, measured cost, and latency. Agreement is
 * a proxy, not ground truth — read the diffs for the emails it flags.
 *
 * Both models are called for every fixture, so this costs real money. At ~30
 * emails it is cents, but check the printed estimate before a large run.
 */

// Offline run: keep these calls out of the weekly metrics table.
process.env.LUMI_NO_USAGE_PERSIST = "1";

import { readFileSync } from "fs";
import { costUsd, type Usage } from "../src/lib/services/llm-cost";
import { extractEvents } from "../src/lib/services/extract";

type Email = { subject: string; from: string; bodyText: string; receivedAt: string };

const BASELINE = process.env.BASELINE_MODEL ?? "claude-haiku-4-5";
const CANDIDATE = process.env.CANDIDATE_MODEL ?? "qwen-plus";

type Extracted = { title: string; startTime: string; relevance: number; kind: string };
type Run = { events: Extracted[]; usage: Usage; ms: number };

/**
 * `extract.ts` reads LLM_MODEL per call, so switching providers is just an env
 * write — no module-cache games. The usage line it logs is captured so the
 * harness can report real tokens rather than re-estimating them.
 */
async function runWith(model: string, email: Email): Promise<Run> {
  process.env.LLM_MODEL = model;
  delete process.env.LLM_PROVIDER;

  const started = Date.now();
  const captured: Usage[] = [];
  const log = console.log;
  console.log = (...args: unknown[]) => {
    const line = typeof args[0] === "string" ? args[0] : "";
    if (line.includes('"llm.usage"')) {
      const u = JSON.parse(line) as { in: number; out: number };
      captured.push({ inputTokens: u.in, outputTokens: u.out });
      return;
    }
    log(...args);
  };

  try {
    const events = (await extractEvents({
      ...email,
      receivedAt: new Date(email.receivedAt),
    })) as Extracted[];
    return {
      events,
      usage: captured[0] ?? { inputTokens: 0, outputTokens: 0 },
      ms: Date.now() - started,
    };
  } finally {
    console.log = log;
  }
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("usage: npx tsx scripts/compare-extractors.ts <fixtures.json>");
    process.exit(1);
  }
  const emails = JSON.parse(readFileSync(path, "utf8")) as Email[];
  console.log(`${emails.length} emails · baseline=${BASELINE} · candidate=${CANDIDATE}\n`);

  const totals: Record<string, { usage: Usage; ms: number[]; found: number }> = {
    [BASELINE]: { usage: { inputTokens: 0, outputTokens: 0 }, ms: [], found: 0 },
    [CANDIDATE]: { usage: { inputTokens: 0, outputTokens: 0 }, ms: [], found: 0 },
  };
  let agree = 0;
  const relevanceDeltas: number[] = [];

  for (const [i, email] of emails.entries()) {
    const a = await runWith(BASELINE, email);
    const b = await runWith(CANDIDATE, email);

    for (const [model, run] of [
      [BASELINE, a],
      [CANDIDATE, b],
    ] as const) {
      totals[model].usage.inputTokens += run.usage.inputTokens;
      totals[model].usage.outputTokens += run.usage.outputTokens;
      totals[model].ms.push(run.ms);
      totals[model].found += run.events.length;
    }

    const same = a.events.length === b.events.length;
    if (same) agree++;
    if (a.events.length && b.events.length) {
      relevanceDeltas.push(mean(b.events.map((e) => e.relevance)) - mean(a.events.map((e) => e.relevance)));
    }

    const flag = same ? "  " : "!!";
    console.log(
      `${flag} [${String(i + 1).padStart(3)}] ${a.events.length} vs ${b.events.length}  ${email.subject.slice(0, 60)}`
    );
    if (!same) {
      console.log(`      ${BASELINE}: ${a.events.map((e) => e.title).join(" | ") || "(none)"}`);
      console.log(`      ${CANDIDATE}: ${b.events.map((e) => e.title).join(" | ") || "(none)"}`);
    }
  }

  console.log(`\n${"─".repeat(72)}`);
  console.log(
    `count agreement : ${agree}/${emails.length} (${((agree / emails.length) * 100).toFixed(1)}%)`
  );
  console.log(
    `mean relevance Δ : ${relevanceDeltas.length ? (mean(relevanceDeltas) >= 0 ? "+" : "") + mean(relevanceDeltas).toFixed(2) : "n/a"}  (candidate − baseline)`
  );

  for (const model of [BASELINE, CANDIDATE]) {
    const t = totals[model];
    const cost = costUsd(model, t.usage);
    const perCall = cost === null ? null : cost / emails.length;
    console.log(
      `\n${model}\n` +
        `  events found : ${t.found}\n` +
        `  tokens       : ${t.usage.inputTokens} in / ${t.usage.outputTokens} out\n` +
        `  cost         : ${cost === null ? "unpriced" : `$${cost.toFixed(4)} total · $${perCall!.toFixed(6)}/call`}\n` +
        `  latency p50  : ${t.ms.sort((x, y) => x - y)[Math.floor(t.ms.length / 2)]}ms`
    );
  }

  const bCost = costUsd(CANDIDATE, totals[CANDIDATE].usage);
  const aCost = costUsd(BASELINE, totals[BASELINE].usage);
  if (aCost && bCost) {
    const perCall = (aCost - bCost) / emails.length;
    console.log(
      `\nsaving: $${perCall.toFixed(6)}/call → $${(perCall * 30 * Number(process.env.CALLS_PER_DAY ?? 15)).toFixed(2)}/month at ${process.env.CALLS_PER_DAY ?? 15} calls/day`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
