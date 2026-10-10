/**
 * The Friday read. Everything the pilot is supposed to produce, as numbers.
 *
 *   npx tsx scripts/weekly-metrics.ts          # last 7 days
 *   DAYS=30 npx tsx scripts/weekly-metrics.ts
 *
 * Reports precision, reported misses, cost per accepted event, and per-user
 * activity — plus a per-model split, so a model swap's effect on quality is
 * visible rather than inferred.
 */

import { config as loadEnv } from "dotenv";
loadEnv();

import { prisma } from "@/lib/db";

const DAYS = Number(process.env.DAYS ?? 7);
const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);

function pct(n: number, d: number): string {
  return d === 0 ? "n/a" : `${((n / d) * 100).toFixed(1)}%`;
}

function bar(v: number, max: number, width = 22): string {
  if (max <= 0 || v <= 0) return "";
  // A non-zero count always shows at least one block, so small values stay visible.
  return "█".repeat(Math.max(1, Math.round((v / max) * width)));
}

async function main() {
  console.log(`\nLumi — last ${DAYS} days (since ${since.toISOString().slice(0, 10)})`);
  console.log("═".repeat(64));

  const [users, onboarded, events, misses, usage] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { onboardedAt: { not: null } } }),
    prisma.event.findMany({
      where: { createdAt: { gte: since } },
      select: { status: true, relevance: true, extractedBy: true, userId: true, detectedVia: true },
    }),
    prisma.miss.count({ where: { createdAt: { gte: since } } }),
    prisma.llmUsage.findMany({
      where: { createdAt: { gte: since } },
      select: { model: true, usd: true, inputTokens: true, outputTokens: true, ms: true },
    }),
  ]);

  const accepted = events.filter((e) => e.status === "ACCEPTED").length;
  const declined = events.filter((e) => e.status === "DECLINED").length;
  const decided = accepted + declined;
  const spend = usage.reduce((a, u) => a + (u.usd ?? 0), 0);

  console.log("\n▸ THE FOUR NUMBERS");
  console.log(`  precision              ${pct(accepted, decided)}   (${accepted} accepted / ${decided} decided)`);
  console.log(`  misses reported        ${misses}${misses > 0 ? `   ← ${(misses / Math.max(onboarded, 1)).toFixed(1)} per active user` : ""}`);
  console.log(
    `  cost per accepted      ${accepted > 0 && spend > 0 ? `$${(spend / accepted).toFixed(4)}` : "n/a"}   ($${spend.toFixed(4)} spend / ${accepted} accepted)`
  );
  console.log(`  users onboarded        ${onboarded} / ${users}`);

  if (decided === 0) {
    console.log("\n  ⚠ Nobody has accepted or declined anything yet — precision is");
    console.log("    unmeasurable. That is the first thing to fix, not the model.");
  }

  console.log("\n▸ BY MODEL");
  const models = [...new Set(usage.map((u) => u.model))];
  if (models.length === 0) {
    console.log("  (no extraction calls recorded — LlmUsage is empty)");
  }
  for (const m of models) {
    const rows = usage.filter((u) => u.model === m);
    const ev = events.filter((e) => e.extractedBy === m);
    const acc = ev.filter((e) => e.status === "ACCEPTED").length;
    const dec = ev.filter((e) => e.status === "DECLINED").length;
    const cost = rows.reduce((a, u) => a + (u.usd ?? 0), 0);
    const lat = rows.map((r) => r.ms).sort((a, b) => a - b);
    console.log(
      `  ${m.padEnd(20)} calls=${String(rows.length).padStart(5)}  events=${String(ev.length).padStart(4)}` +
        `  precision=${pct(acc, acc + dec).padStart(6)}  $${cost.toFixed(4)}  p50=${lat[Math.floor(lat.length / 2)] ?? 0}ms`
    );
  }

  console.log("\n▸ EXTRACTION TIER  (how many events needed the model at all)");
  for (const via of ["ICS", "SCHEMA_ORG", "KEYWORD", "LLM"]) {
    const n = events.filter((e) => e.detectedVia === via).length;
    if (n) console.log(`  ${via.padEnd(12)} ${String(n).padStart(4)}  ${bar(n, events.length)}`);
  }

  console.log("\n▸ RELEVANCE DISTRIBUTION  (a healthy rubric is not all 3s)");
  const max = Math.max(...[1, 2, 3, 4, 5].map((r) => events.filter((e) => e.relevance === r).length), 1);
  for (const r of [5, 4, 3, 2, 1]) {
    const n = events.filter((e) => e.relevance === r).length;
    console.log(`  r=${r}  ${String(n).padStart(4)}  ${bar(n, max)}`);
  }

  console.log("\n▸ PER USER");
  const byUser = new Map<string, { total: number; acc: number }>();
  for (const e of events) {
    const cur = byUser.get(e.userId) ?? { total: 0, acc: 0 };
    cur.total++;
    if (e.status === "ACCEPTED") cur.acc++;
    byUser.set(e.userId, cur);
  }
  if (byUser.size === 0) console.log("  (no events this window)");
  for (const [id, v] of [...byUser.entries()].sort((a, b) => b[1].total - a[1].total)) {
    console.log(`  ${id.slice(0, 10)}…  events=${String(v.total).padStart(4)}  accepted=${String(v.acc).padStart(3)}`);
  }

  console.log();
}

main()
  .catch((e) => {
    console.error("\n✗", e instanceof Error ? e.message : e, "\n");
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
