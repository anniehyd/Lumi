/**
 * Hand-label the golden set so precision and recall are measured, not guessed.
 *
 *   npx tsx scripts/label-emails.ts [eval/golden/cases.json] [--limit 100] [--only-model]
 *
 * For each email you answer two questions: does it contain a real, upcoming
 * event the recipient could attend (y/n), and if the pipeline extracted
 * events, are they right (y = all right, p = some, n = none). Answers are
 * saved to eval/labels.json after every email, so you can stop and resume.
 * At the end, and on every run, it prints:
 *
 *   precision  emails the pipeline made a card for that really had an event
 *   recall     emails with a real event that the pipeline made a card for
 *
 * Offline: no model, no network. --only-model shows just the emails that
 * reached the model, which is where the judgement calls are.
 */
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

type Case = {
  id: string;
  from: string;
  subject: string;
  receivedAt: string;
  bodyText: string;
  passesKeywordGate: boolean;
  expectedEvents: { title: string; startTime: string }[];
};

type Label = { id: string; realEvent: boolean; extractionOk: "y" | "p" | "n" | null; note?: string; at: string };

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--")) ?? "eval/golden/cases.json";
const limitArg = args.indexOf("--limit");
const limit = limitArg >= 0 ? Number(args[limitArg + 1]) : Infinity;
const onlyModel = args.includes("--only-model");
const LABELS = "eval/labels.json";

const cases: Case[] = JSON.parse(readFileSync(file, "utf8"));
const labels: Label[] = existsSync(LABELS) ? JSON.parse(readFileSync(LABELS, "utf8")) : [];
const done = new Set(labels.map((l) => l.id));

function save() {
  writeFileSync(LABELS, JSON.stringify(labels, null, 2) + "\n");
}

function report() {
  const byId = new Map(cases.map((c) => [c.id, c]));
  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (const l of labels) {
    const c = byId.get(l.id);
    if (!c) continue;
    const predicted = c.expectedEvents.length > 0;
    if (predicted && l.realEvent) tp++;
    else if (predicted && !l.realEvent) fp++;
    else if (!predicted && l.realEvent) fn++;
    else tn++;
  }
  const precision = tp + fp ? tp / (tp + fp) : NaN;
  const recall = tp + fn ? tp / (tp + fn) : NaN;
  const pct = (v: number) => (Number.isNaN(v) ? "n/a" : `${(v * 100).toFixed(0)}%`);
  console.log(`\n${labels.length} labeled of ${cases.length}`);
  console.log(`  cards that were real events (precision): ${pct(precision)}   [${tp} right, ${fp} wrong]`);
  console.log(`  real events that got a card (recall):    ${pct(recall)}   [${tp} caught, ${fn} missed]`);
  console.log(`  correctly left alone: ${tn}`);
  const extraction = labels.filter((l) => l.extractionOk);
  if (extraction.length) {
    const ok = extraction.filter((l) => l.extractionOk === "y").length;
    const partial = extraction.filter((l) => l.extractionOk === "p").length;
    console.log(`  extraction fully right on ${ok}/${extraction.length} cards, partly right on ${partial}`);
  }
}

async function main() {
  const rl = createInterface({ input: stdin, output: stdout });
  const todo = cases.filter((c) => !done.has(c.id)).filter((c) => !onlyModel || c.passesKeywordGate).slice(0, limit);
  console.log(`${todo.length} to label. Answers: y / n, or q to stop. Enter keeps going.\n`);
  for (const [i, c] of todo.entries()) {
    console.log(`\n━━━ ${i + 1}/${todo.length} ━━━ ${c.receivedAt.slice(0, 10)}`);
    console.log(`From:    ${c.from}`);
    console.log(`Subject: ${c.subject}`);
    console.log(`\n${c.bodyText.replace(/\s+/g, " ").slice(0, 700)}${c.bodyText.length > 700 ? " …" : ""}\n`);
    if (c.expectedEvents.length) {
      console.log("Pipeline made cards for:");
      for (const e of c.expectedEvents) console.log(`  • ${e.title}  (${e.startTime.slice(0, 16)})`);
    } else {
      console.log("Pipeline made no card.");
    }
    const a = (await rl.question("\nReal upcoming event in this email? [y/n/q] ")).trim().toLowerCase();
    if (a === "q") break;
    const realEvent = a === "y";
    let extractionOk: Label["extractionOk"] = null;
    if (c.expectedEvents.length) {
      const b = (await rl.question("Are the cards right? [y = all / p = some / n = none] ")).trim().toLowerCase();
      extractionOk = b === "y" ? "y" : b === "p" ? "p" : "n";
    }
    const note = (await rl.question("Note (optional): ")).trim();
    labels.push({ id: c.id, realEvent, extractionOk, ...(note ? { note } : {}), at: new Date().toISOString() });
    save();
  }
  rl.close();
  report();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
