# Lumi cost

Where the money went, what changed, and what one user costs per month now.

**Every number here is labelled as one of:**
*invoice* (a bill you were actually charged), *replay* (measured tonight by
running the code offline over the 14-day email sample in `eval/golden/`),
*list price* (a published rate, checked 2026-10-09), or *assumption*. Nothing
below was measured against a live deployment, because there is none.

## Summary

| | Before (September) | After (this branch) |
|---|---|---|
| Hosting, per month | **$24.49** *invoice* | **≈ $0.30** with a free-tier database, **≈ $2.65** all on Fly *list price + assumption* |
| Model, per user per month | ≈ $0.75 on Haiku 4.5 *replay + assumption* | ≈ $0.26 on Haiku 4.5 *replay + assumption* |
| **Total for one user** | **≈ $25** | **≈ $0.55 – $2.90** |
| Original target | $10–12 | |

The single user's bill was 97% fixed hosting. The model was never the problem.

## Where the money went

Your September Fly invoice was **$24.49**, of which **$18.92 was Upstash
Redis** (77%). Those two figures come from notes saved when the deployment was
shut down on Oct 2, not from anything in this repo — please check them against
the invoice itself before quoting them.

| Line | Monthly | Source | Why |
|---|---|---|---|
| Upstash Redis (pay-as-you-go) | $18.92 | *invoice* | BullMQ. An idle BullMQ consumer never stops talking to Redis: blocking pops, stalled-job checks, heartbeats. Pay-per-command pricing bills every one, whether or not there is any work. Lumi had two consumers running 24/7 to process two sweeps a day. |
| Everything else on Fly | $5.57 | *invoice* (remainder) | Consistent with an always-on 512 MB worker ($3.69 *list price*) plus a small Postgres machine and volume (≈ $2.34 *list price*), with the auto-stopping web machine near zero. The split is my reconstruction, not an itemised bill. |
| Model API | not on this invoice | — | Billed separately by the model provider. See below. |

Two findings from reading the code:

- **The reminder queue did nothing.** `scheduleMaybeReminder` is never called,
  so one of the two always-on consumers was polling Redis for jobs that could
  not exist.
- **The queue bought no capability.** Each ingest job is a plain async function
  over one user's mail. With one user, a queue adds a network hop and a bill.

### Model cost, before

No per-call usage data exists in the repo: the `LlmUsage` table was added in
your uncommitted work and the production database is gone. So this is
reconstructed from the email sample.

*Replay:* over 13.9 days, 405 emails arrived and 52 passed the keyword gate,
so 52 model calls. 45 of those 52 (87%) came back with no events. The 52 bodies
total 939,190 characters.

*Assumptions:* 4 characters per token; 1,100 tokens of system prompt and tool
schema per call; 200 output tokens per call on average; a 30.4-day month.

| Model | Calls / month | Input tokens | Output tokens | Cost |
|---|---|---|---|---|
| Sonnet 4.6 ($3 / $15 per M) | 114 | 639 K | 23 K | $2.26 |
| Haiku 4.5 ($1 / $5 per M) | 114 | 639 K | 23 K | $0.75 |

Notes saved in August recorded a *measured* ≈ $1.60 per user per month on
Haiku 4.5 with 30-minute sweeps. That is about twice this estimate. The likely
reasons are that URL-heavy text tokenizes worse than 4 characters per token,
and that the sample here was taken after the Gmail category filter was in
place. Treat $0.75 as a floor and $1.60 as the realistic "before".

## What changed

### 1. No Redis, no always-on worker — saves ≈ $22.60 / month

`INGEST_MODE=inline` is now the default (`src/lib/services/sweep.ts`). The
sweep ingests in the process that received the trigger. An external scheduler
calls `POST /api/cron/sweep` twice a day; the web machine wakes, works, and
stops. BullMQ remains available behind `INGEST_MODE=queue` for the day one
process can no longer get through every inbox.

| Removed | Monthly |
|---|---|
| Upstash Redis | $18.92 *invoice* |
| Always-on 512 MB worker machine | $3.69 *list price* |

Not verified against a live deployment: that Fly keeps the machine awake for
the full length of a streamed response. The route sends a heartbeat every 10
seconds for exactly this reason, but the first real sweep should be watched.

### 2. Rule-based pre-filter — 35% fewer model calls

`src/lib/detection/prefilter.ts`. *Replay*, `npm run eval:prefilter`:

| | Before | After |
|---|---|---|
| Model calls over the sample | 52 | 34 |
| — skipped: survey subject | | 5 |
| — skipped: no date or time in the email | | 8 |
| — skipped: bulk sender with no track record | | 5 |
| Emails with known events still reaching the model | 7 | **7** |
| Known events still reachable | 12 | **12** |

The duplicate-content and unchanged-thread rules fired zero times in this
sample (the sample has no thread ids, and its duplicates were caught by the
survey rule first). They are tested but their saving is unmeasured.

**What "12 of 12 kept" does and does not mean.** The labels are what the old
pipeline extracted, not human ground truth. So this shows no regression against
what Lumi used to find. It cannot show that the filter never drops an event the
old pipeline also missed, and 7 positive emails is a small sample: one miss
would be a 14-point drop in recall.

### 3. Link compaction — 80% fewer body characters sent

Tracking URLs were 60–93% of the characters in most newsletter bodies. Each
distinct URL is now replaced by `[L1]`, `[L2]`… before the model sees the
email and restored afterwards.

*Replay:* body characters reaching the model fell from 939,190 to 190,508
(−79.7%, combining this with the pre-filter).

**This is the one change not validated against a real model.** It alters what
the model reads and adds one instruction to the prompt. The risk is confined to
the RSVP link field, and a placeholder is arguably easier for a model to copy
than a 400-character tracking URL, but that is an argument, not a measurement.
Running `scripts/compare-extractors.ts` once (it costs cents) would settle it.
`LLM_COMPACT_LINKS=false` switches it off.

### 4. Cheaper default model

The in-code fallback was Sonnet 4.6, used whenever `LLM_MODEL` was unset. It is
now Haiku 4.5, which is what production ran and what `.env.example` suggested.
This changes nothing for a correctly configured deployment; it removes a 3×
cost trap for a misconfigured one.

### 5. Skip mail already ingested

Sweeps overlap by an hour on purpose. The old code downloaded and parsed every
listed message in full, then discarded the ones it already had. It now checks
stored Gmail ids first. This saves Gmail quota and machine seconds, not dollars
on the model bill.

### 6. Failed emails are retried instead of lost

Not a saving, but it stops a hidden cost: an email whose model call failed was
previously marked as seen and never looked at again.

## Model cost, after

Same assumptions as above, with the prompt overhead raised to 1,160 tokens for
the two added prompt lines.

| Model | Calls / month | Input tokens | Output tokens | Cost |
|---|---|---|---|---|
| Sonnet 4.6 | 74 | 190 K | 15 K | $0.79 |
| **Haiku 4.5 (default)** | 74 | 190 K | 15 K | **$0.26** |
| Haiku 5.5 ($0.10 / $0.50 per M) | 74 | 190 K | 15 K | $0.03 |

If the August measurement ($1.60) is the true "before", the same 65% reduction
gives roughly $0.55 per user per month on Haiku 4.5.

## Hosting, after

*List prices*, Fly `ewr` region, checked 2026-10-09: shared-cpu-1x 512 MB
$3.69/month running, 256 MB $2.19; stopped machines and volumes $0.15 per GB
per month. Neon free plan: $0, 1 GB storage, 100 compute-hours per project,
scales to zero after 5 minutes idle.

| Component | Option A: free-tier DB | Option B: all on Fly |
|---|---|---|
| Web machine, auto-stop. *Assumption:* awake about 1 hour a day | $0.15 | $0.15 |
| Stopped-machine root filesystem, about 1 GB | $0.15 | $0.15 |
| Postgres | Neon free: $0 | 256 MB machine $2.19 + 1 GB volume $0.15 |
| Scheduler | GitHub Actions: $0 | GitHub Actions: $0 |
| Redis | none | none |
| **Hosting total** | **≈ $0.30** | **≈ $2.65** |
| Plus model, one user, Haiku 4.5 | $0.26 | $0.26 |
| **Total** | **≈ $0.55** | **≈ $2.90** |

Both are well under the $10–12 target. Hosting is a fixed cost shared by all
users; each additional user adds about the model cost only.

Do not use Fly Managed Postgres for this: its smallest plan is $38 a month.

## Not done, and why

| Idea | Expected saving | Why not tonight |
|---|---|---|
| **Haiku 5.5** | ≈ 90% of the model bill | Ten times cheaper at list price and the code needs no change to call it (`LLM_MODEL=claude-haiku-5-5`). But it thinks by default, which adds output tokens, and I could not run an accuracy comparison without spending your money. A price row is in `llm-cost.ts` so its spend will be tracked. |
| **Message Batches API** | 50% of the model bill | Sweeps are not latency-sensitive, so this fits. It needs a submit-then-collect state machine across sweeps, which should not be written without a live API to test against. At $0.26 a month it saves 13 cents per user. |
| **Prompt caching** | under 10% | The shared prefix is about 1,100 tokens. Haiku 4.5 only caches prefixes of 4,096 tokens or more, so a cache marker would silently do nothing. It would start working on Haiku 5.5 (512-token minimum). |
| **Several emails per model call** | saves the 1,100-token prefix on some calls | Hurts attribution of events to emails and risks cross-contamination between unrelated messages. |
| **Relevance pass for ICS events** | negative (adds calls) | A quality fix, not a saving. |

## Assumptions to replace with real numbers

Once a deployment has run for a week, `npm run metrics` prints measured model
calls, tokens and spend from `MetricDaily` and `LlmUsage`. Replace, in order of
how much they move the estimate:

1. Characters per token (4 assumed; URL-heavy text is worse).
2. Output tokens per call (200 assumed).
3. Hours per day the web machine is awake (1 assumed).
4. Emails per day (29 in the sample; yours in term time may differ).
