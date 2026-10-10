/**
 * Per-call token accounting for the extraction LLM.
 *
 * Lumi had no usage logging, which made "what does the model cost per month?"
 * unanswerable. Every extraction call now emits one structured line so the
 * question can be answered from `fly logs` instead of estimated.
 *
 * Prices are USD per 1M tokens. Anthropic rates are first-party list prices.
 * Qwen rates are Alibaba Cloud Model Studio (international endpoint) as
 * reported by third-party trackers in Sept 2026 — re-check the official
 * pricing page before quoting these anywhere that matters.
 */

import { prisma } from "@/lib/db";

export type Usage = { inputTokens: number; outputTokens: number };

const PRICES: Record<string, { in: number; out: number }> = {
  // Anthropic — https://docs.anthropic.com/en/docs/about-claude/pricing
  "claude-sonnet-5": { in: 2.0, out: 10.0 },
  "claude-sonnet-4-6": { in: 3.0, out: 15.0 },
  "claude-haiku-4-5": { in: 1.0, out: 5.0 },
  // Qwen — Alibaba Cloud Model Studio, international endpoint.
  // `qwen-flash` is an alias that Alibaba repoints at newer snapshots, so its
  // rate can move under you. Pin a dated/versioned id if the bill must be
  // predictable, and re-check these against the official pricing page.
  "qwen-max": { in: 2.0, out: 6.0 },
  "qwen-plus": { in: 0.4, out: 1.6 },
  "qwen-flash": { in: 0.15, out: 0.47 },
  // Tiered by context length: these are the <32K rates. Lumi's calls average
  // ~4.2K tokens so they sit in this tier, but the 35K-token outlier in the
  // golden set crosses into the 32K-256K tier ($0.10/$0.40).
  "qwen3.7-flash": { in: 0.03, out: 0.13 },
  "qwen3.8-flash": { in: 0.15, out: 0.47 },
  "qwen3.5-flash": { in: 0.1, out: 0.4 },
  // DeepSeek — rates double during peak (01:00-04:00 and 06:00-10:00 UTC).
  // Both sweeps (13:00/19:00 America/New_York) land off-peak year-round, so
  // the off-peak rate is the one Lumi actually pays; -peak is here to price
  // an ad-hoc daytime run honestly.
  "deepseek-v4.1-flash": { in: 0.15, out: 0.6 },
  "deepseek-v4.1-flash-peak": { in: 0.3, out: 1.2 },
};

/** USD for one call. Returns null for a model with no price on file. */
export function costUsd(model: string, usage: Usage): number | null {
  const p = PRICES[model];
  if (!p) return null;
  return (usage.inputTokens / 1e6) * p.in + (usage.outputTokens / 1e6) * p.out;
}

/**
 * One line per extraction call. Grep-friendly on purpose:
 *   fly logs -a lumi-live | grep llm.usage
 */
export function logUsage(args: {
  provider: string;
  model: string;
  usage: Usage;
  events: number;
  ms: number;
  promptVersion?: string;
}): void {
  const cost = costUsd(args.model, args.usage);
  console.log(
    JSON.stringify({
      tag: "llm.usage",
      provider: args.provider,
      model: args.model,
      in: args.usage.inputTokens,
      out: args.usage.outputTokens,
      events: args.events,
      ms: args.ms,
      usd: cost === null ? null : Number(cost.toFixed(6)),
    })
  );

  // Persisted so cost per accepted event is computable later. Fire-and-forget:
  // a metrics write must never take down an extraction. Offline harnesses set
  // LUMI_NO_USAGE_PERSIST so an A/B run doesn't land in the weekly numbers.
  if (process.env.LUMI_NO_USAGE_PERSIST === "1") return;
  prisma.llmUsage
    .create({
      data: {
        model: args.model,
        provider: args.provider,
        promptVersion: args.promptVersion ?? null,
        inputTokens: args.usage.inputTokens,
        outputTokens: args.usage.outputTokens,
        events: args.events,
        usd: cost,
        ms: args.ms,
      },
    })
    .catch(() => {});
}
