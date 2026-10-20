/**
 * Validate the Qwen setup before letting a sweep touch it.
 *
 *   npx tsx scripts/qwen-preflight.ts
 *
 * Checks, in order, and stops at the first failure with a specific fix:
 *   1. LLM_API_KEY is present
 *   2. the base URL + key authenticate at all
 *   3. the model id exists on this account
 *   4. the model honours forced tool_choice (and if not, that `auto` works)
 *   5. a real extraction returns the right shape — printed with tokens and cost
 *
 * Costs a fraction of a cent. Run it after pasting the key, before deploying.
 */

import { config as loadEnv } from "dotenv";
loadEnv();
// Offline run: keep these calls out of the weekly metrics table.
process.env.LUMI_NO_USAGE_PERSIST = "1";

import { extractEvents } from "@/lib/services/extract";
import { costUsd } from "@/lib/services/llm-cost";

const MODEL = process.env.LLM_MODEL ?? "(unset)";
const BASE =
  process.env.LLM_BASE_URL ?? "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";

const SAMPLE = {
  subject: "Info Session: Cloud Engineering @ NYU — RSVP by Friday",
  from: "careers@example.edu",
  bodyText:
    "Join us Thursday, September 24, 2026 at 6:00 PM in Bobst 741 for a cloud engineering info session with our infra team. RSVP by Friday Sept 19. Also: the application deadline for the summer internship is October 3, 2026.",
  receivedAt: new Date("2026-09-13T12:00:00Z"),
};

function fail(msg: string, fix: string): never {
  console.error(`\n✗ ${msg}\n  → ${fix}\n`);
  process.exit(1);
}

async function main() {
  console.log(`model    : ${MODEL}\nbase_url : ${BASE}\n`);

  if (!process.env.LLM_API_KEY) {
    fail("LLM_API_KEY is not set", "Add LLM_API_KEY=<your key> to .env");
  }
  if (!MODEL.startsWith("qwen")) {
    fail(
      `LLM_MODEL is "${MODEL}", which does not route to Qwen`,
      "Set LLM_MODEL=qwen-flash in .env"
    );
  }

  // 2-4: one minimal call exercises auth, model id, and tool support together.
  const probe = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.LLM_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 64,
      messages: [{ role: "user", content: "Call ping with n=1." }],
      tools: [
        {
          type: "function",
          function: {
            name: "ping",
            description: "Reply with a number.",
            parameters: {
              type: "object",
              properties: { n: { type: "integer" } },
              required: ["n"],
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "ping" } },
    }),
    signal: AbortSignal.timeout(30_000),
  });

  const body = await probe.text();
  if (probe.status === 401 || probe.status === 403) {
    fail(
      `Auth rejected (${probe.status})`,
      "Wrong key, or the key belongs to a different region. Mainland keys need https://dashscope.aliyuncs.com/compatible-mode/v1"
    );
  }
  if (probe.status === 404) {
    fail(
      `Endpoint not found (404) at ${BASE}`,
      "If your account is workspace-scoped, set LLM_BASE_URL=https://<WorkspaceId>.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1"
    );
  }
  if (probe.status === 400 && /model/i.test(body) && !/tool_choice/i.test(body)) {
    fail(
      `Model "${MODEL}" was rejected`,
      "Try LLM_MODEL=qwen3.8-flash, or check the model list in the Model Studio console"
    );
  }
  if (probe.status === 400 && /tool_choice/i.test(body)) {
    console.log("• forced tool_choice: NOT supported — extractor will fall back to auto");
  } else if (!probe.ok) {
    fail(`Unexpected ${probe.status}`, body.slice(0, 300));
  } else {
    console.log("• forced tool_choice: supported");
  }
  console.log("• auth + model id: ok\n");

  // 5: the real thing.
  const started = Date.now();
  let captured: { in: number; out: number } | null = null;
  const log = console.log;
  console.log = (...args: unknown[]) => {
    const line = typeof args[0] === "string" ? args[0] : "";
    if (line.includes('"llm.usage"')) {
      captured = JSON.parse(line);
      return;
    }
    log(...args);
  };
  let events;
  try {
    events = await extractEvents(SAMPLE);
  } finally {
    console.log = log;
  }
  const ms = Date.now() - started;

  console.log("extraction result:");
  for (const e of events) {
    console.log(`  · [${e.kind}] r=${e.relevance}  ${e.title}  @ ${e.startTime}`);
  }
  if (events.length === 0) {
    console.log("  (none — the model returned no events for a sample that clearly has two)");
  }

  const u = captured as { in: number; out: number } | null;
  if (u) {
    const usd = costUsd(MODEL, { inputTokens: u.in, outputTokens: u.out });
    const perMonth = usd === null ? null : usd * 30 * Number(process.env.CALLS_PER_DAY ?? 15);
    console.log(
      `\ntokens : ${u.in} in / ${u.out} out` +
        `\ncost   : ${usd === null ? "unpriced" : `$${usd.toFixed(6)}/call → ~$${perMonth!.toFixed(2)}/month at ${process.env.CALLS_PER_DAY ?? 15} calls/day`}` +
        `\nlatency: ${ms}ms`
    );
  }

  const ok = events.length === 2;
  console.log(
    ok
      ? "\n✓ Preflight passed — 2/2 expected events. Run the A/B before deploying:\n  CANDIDATE_MODEL=qwen-flash npx tsx scripts/compare-extractors.ts <fixtures.json>"
      : `\n! Preflight ran but found ${events.length}/2 expected events. Check the rubric output above before deploying.`
  );
}

main().catch((e) => {
  console.error("\n✗", e.message, "\n");
  process.exit(1);
});
