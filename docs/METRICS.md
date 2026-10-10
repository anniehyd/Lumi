# Lumi metrics

**There is no data yet.** The tracking below was added on the
`overnight-improvements` branch and has never run against a real inbox: the
production database was shut down on Oct 2 and the only historical data is a
14-day email sample with no accept or decline decisions in it. Every number
this document describes will read "no data" until the first sweep runs on this
build. Do not quote figures from here; quote what `npm run metrics` prints
after a week of use.

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

**`M` and `R` are my guesses, not measurements.** Before using this number
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
  "Lumi missed something" button (`Miss` table); the pre-filter added tonight
  makes that button more important, not less.
- **Whether a relevance score was right.** The score is recorded per event;
  `npm run metrics` prints the distribution of scores, and accept rate by
  star level can be queried from `Event`, but neither is computed for you yet.
- **Anything before this build.** There is no backfill.

## Interview-safe statements

True today, from code and the offline replay, with the caveats attached:

- "On a 14-day sample of 405 real emails, rule-based filtering cut model calls
  from 52 to 34 without losing any of the 12 events the old pipeline found."
  (Labels are the old pipeline's output, not hand-labelled truth.)
- "Replacing tracking links with placeholders cut the text sent to the model by
  about 80% on that sample." (Not yet validated for accuracy against a live
  model.)
- "87% of model calls were returning nothing, which is what told me where to
  filter."
- "Hosting went from $24.49 a month to an estimated under $3, mostly by
  removing a queue that was billing per poll." (After-figure is an estimate
  from list prices.)

Not yet true, so do not say them: any accept rate, any time-saved figure, any
per-user cost measured in production.
