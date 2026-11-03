# Lumi metrics

What Lumi counts, where the counts live, and how the derived figures are
calculated.

## Where the numbers live

One row per user per UTC day in the `MetricDaily` table. Unlike `Email`,
`Event` and `LlmUsage`, it is **never purged**, so lifetime totals survive the
14-day retention window. Rows are written by `recordMetrics` in
`src/lib/metrics.ts`; a failed write is logged and never blocks ingestion or a
click.

## How to read them

| Way | Shows |
|---|---|
| Settings → "Your numbers — last 7 days" | Your own funnel, six figures |
| `GET /api/metrics?days=30` (signed in) | The same as JSON, 1–365 days |
| `npm run metrics` (or `DAYS=30 npm run metrics`) | All users: funnel, precision, per-model split, relevance distribution. Needs `DATABASE_URL`. |

## Counters

| Counter | Incremented when | Counted in |
|---|---|---|
| `emailsScanned` | A new email is stored and enters the pipeline. Mail Gmail's category filter excluded, and mail already ingested, is not counted. | `ingest.ts` |
| `emailsSkipped` | The keyword gate or a pre-filter rule stopped an email before the model. The reason is on `Email.skipReason`. | `ingest.ts` |
| `emailsToModel` | An extraction call was made, whether or not it found anything. | `ingest.ts` |
| `eventsFound` | Events a tier extracted, before de-duplication and the past-event filter. Handshake feed events are excluded (the feed repeats them every sweep). | `ingest.ts` |
| `eventsCreated` | Event cards actually shown to the user. | `ingest.ts` |
| `eventsAccepted` | An event's status changed **into** `ACCEPTED`. | `events/[id]/route.ts`, `calendar.ts` |
| `eventsDeclined` | Status changed into `DECLINED`. | same |
| `eventsMaybe` | Status changed into `MAYBE`. | same |
| `acceptsReverted` | Status changed **out of** `ACCEPTED`. | same |
| `llmInputTokens`, `llmOutputTokens`, `llmUsd` | Per extraction call, from the provider's reported usage and the price table in `llm-cost.ts`. | `ingest.ts` |

`emailsScanned − emailsSkipped − emailsToModel` is the number of emails
resolved by the free tiers (ICS, schema.org) or that failed and are awaiting a
retry.

Re-sending the same status does not count twice: only a real transition is
recorded.

## Derived figures

| Figure | Formula | Reads as |
|---|---|---|
| Net accepted | `eventsAccepted − acceptsReverted` | Events that ended up on the calendar |
| Model rate | `emailsToModel / emailsScanned` | Share of mail that cost money. Lower is cheaper. |
| Accept rate | `netAccepted / (netAccepted + eventsDeclined)` | Precision as the user judges it. Maybe and undecided cards are excluded. |
| Cost per accepted event | `llmUsd / netAccepted` | The number that catches a cheaper model quietly getting worse |

Each is reported as "no data" (null), not zero, when its denominator is zero.

## Estimated time saved per week

```
minutes_saved_per_week =
    max(0,  netAccepted × M  −  eventsCreated × R / 60)  ÷  (days / 7)
```

- `M` = minutes to read an invitation and create the calendar entry by hand.
  **Default 2.** Env: `METRICS_MINUTES_PER_MANUAL_ENTRY`.
- `R` = seconds to read one Lumi card and decide. **Default 10.**
  Env: `METRICS_SECONDS_PER_CARD_REVIEW`.

In words: time you would have spent typing accepted events into a calendar,
minus time you spent reviewing every card Lumi showed you, scaled to a week.

**`M` and `R` are defaults, not measurements.** Before using this number
anywhere that matters, time yourself creating five calendar entries from real
emails and reviewing ten cards, and set the two env vars. State them whenever
you state the result: "about N minutes a week, assuming 2 minutes per manual
entry".

What the formula deliberately leaves out, so the figure stays defensible:

- **Triage time.** Lumi scans mail you might otherwise have skimmed, but there
  is no way to know which emails you would have opened, so no credit is taken.
- **Events you would have missed entirely.** Probably the real value of the
  product, and not expressible in minutes. The `Miss` table measures the
  opposite (what Lumi missed).
- **Declined cards** save nothing and cost a review; they are in the
  subtraction.

The result can legitimately be zero. If Lumi shows 50 cards and you accept
none, it cost you time.

## What these numbers cannot tell you

- **Recall.** Accept and decline measure whether what Lumi showed was good.
  Nothing here measures what it never showed. The only recall signal is the
  "Lumi missed something" button (`Miss` table); the pre-filter makes that button more
  important, not less.
- **Whether a relevance score was right.** The score is recorded per event;
  `npm run metrics` prints the distribution of scores, and accept rate by
  star level can be queried from `Event`, but neither is computed for you yet.
- **Anything before this build.** There is no backfill.
