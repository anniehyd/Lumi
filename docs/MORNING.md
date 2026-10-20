# Morning handoff — 2026-10-10

**Lumi can come back for an estimated $0.55–$2.90 a month for one user, down
from $24.49.** The September bill was 77% Redis: an idle job queue billed for
every poll. That queue is gone by default. Typecheck, 217 tests, lint and
`npm run build` all pass on `overnight-improvements`. Nothing was deployed,
pushed, purchased, emailed or run against your Gmail, Calendar or database.

Read this first, then [COST.md](COST.md). Three things need your eyes before
you trust the rest: the link-compaction change is unvalidated against a real
model, no after-cost was measured on a live deployment, and there is no metrics
data yet.

## Where things are

| Branch | State |
|---|---|
| `main` | Untouched. Not pushed to. |
| `overnight-improvements` | Goals 1–4. 10 commits on top of `main`. |
| `feature/group-availability` | Goal 5, one commit on top of the above, behind a flag. |

**Your uncommitted work moved.** `main` had 15 modified and 21 new files that
were never committed (onboarding, profiles, Handshake, miss reports, the eval
scripts). I committed them unchanged as the first commit on the branch
(`2c4c127`) so the work built on the real current state. If you check out
`main` now, those changes are no longer in the working tree; they are safe in
that commit.

## What changed and why

1. **Redis and the always-on worker are no longer needed.** Sweeps run inline
   by default; an external scheduler calls `POST /api/cron/sweep`. This is
   the cost fix. The old queue is still there behind `INGEST_MODE=queue`.
2. **A real rule-based pre-filter before the model.** On your 14-day sample
   (405 emails) it cut model calls from 52 to 34 and kept all 12 events the
   old pipeline found. 87% of model calls had been returning nothing.
3. **Tracking links are replaced by short placeholders before the model call**
   and restored after. Text sent to the model fell about 80% on the sample.
4. **Two users can now actually use it.** Every events request resolved to one
   hardcoded email address, so a second user saw sample data, and any signed-in
   user could read or edit any event by id. Requests are now scoped to the
   signed-in user. The `.ics` download route had no sign-in check at all.
5. **Failed emails are retried.** An email whose model call failed was marked
   as seen and never looked at again. It now gets up to 3 attempts.
6. **Retries with backoff** around Gmail, Calendar, Google token refresh, the
   model and the Handshake feed. A retried calendar insert cannot create a
   duplicate, and accepting an event twice no longer adds it twice.
7. **Malformed input no longer sinks an email**: unparseable dates from the
   model, a broken entry in a calendar feed, bad schema.org markup.
8. **Metrics**: a per-user daily funnel that survives the 14-day purge, an API
   route, a settings card and a section in `npm run metrics`.
9. **Tests**: 23 → 217, all on mocks and fixtures. A setup file makes any
   un-mocked network call throw.
10. **Docs**: architecture with a diagram, cost, metrics; README corrected.
11. **Default model** is Haiku 4.5 instead of Sonnet 4.6 when `LLM_MODEL` is
    unset.

## Cost

| | Before | After |
|---|---|---|
| Hosting / month | $24.49 (your invoice) | ≈ $0.30 with a free-tier database, ≈ $2.65 all on Fly |
| Model / user / month, Haiku 4.5 | ≈ $0.75 (estimate) | ≈ $0.26 (estimate) |
| **One user, total** | **≈ $25** | **≈ $0.55 – $2.90** |

The after-figures are estimates from list prices checked last night and from
replaying your email sample offline. The $24.49 and the $18.92 Redis share come
from notes saved at shutdown, not from the repo — check them against the
invoice. Each additional user adds roughly the model cost only.

### To turn hosting back on

Nothing below was done. In order:

1. Review and merge `overnight-improvements`.
2. Create a Postgres database (decision 1) and set `DATABASE_URL`.
3. Set secrets on the app: `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_ID`,
   `GOOGLE_CLIENT_SECRET`, the model key, and a new random `CRON_SECRET`.
4. `fly deploy -c fly.live.toml`. It is now web-only. The release step runs
   `prisma db push`. On a fresh database this just works. **On a database
   restored from your Oct 2 dump it will stop and ask for
   `--accept-data-loss`**, because the unique key on `Email` changed from
   `messageId` to `(userId, messageId)`. No rows are lost by that change, but
   you have to pass the flag yourself.
5. Add `LUMI_URL` and `CRON_SECRET` as GitHub repository secrets. The sweep
   workflow does nothing until both exist.
6. Add the redirect URI in Google Cloud Console and sign in.
7. Watch the first sweep's logs. Unverified: that Fly keeps the machine awake
   for a whole streamed sweep.

## Metrics that now exist

Emails scanned, emails stopped before the model, emails sent to the model,
events found, event cards created, events accepted / declined / maybe, accepts
walked back, model tokens and spend. From those: share of mail that cost money,
accept rate, cost per accepted event, and estimated minutes saved per week.

**How to read them:** Settings → "Your numbers", `GET /api/metrics?days=30`,
or `npm run metrics`. Definitions and the formula are in
[METRICS.md](METRICS.md).

**There is no data.** Tracking starts with the first sweep on this build. The
time-saved formula uses two guesses of mine (2 minutes to enter an event by
hand, 10 seconds to review a card). Time yourself and set the env vars before
quoting a number.

## How I'd tell the Lumi story

> Lumi turns my inbox into a ranked list of events I can add to my calendar in
> one click. It tries free, exact methods first — calendar attachments and
> structured markup — and only sends an email to a language model if it passes
> a keyword gate and a set of rules, then the model extracts every event and
> scores each 1 to 5 against the interests I gave it at onboarding, so nothing
> is deleted, it is just ranked. When I measured it, 87% of model calls were
> coming back empty, so I added rules that cut calls by a third on two weeks of
> my own mail without losing an event the old pipeline had found. The bigger
> lesson was the bill: I shut it down at $24 a month and found 77% of that was
> a job queue polling an idle Redis, which I replaced with a scheduled HTTP
> call, bringing the estimate under $3.

What to be careful about when telling it:

- **It sweeps twice a day (1 PM and 7 PM), not every 30 minutes.** The
  30-minute interval was replaced on Aug 29.
- **The model does nearly all the finding.** In your sample 12 of 13 events
  came from the model tier, 1 from a calendar attachment, 0 from markup.
- **The pre-filter is new as of last night.** Before, "pre-filtering" was
  Gmail's own category labels plus a 7-phrase negative list.
- **Which model?** The repo defaults to Claude, but both `.env` files on this
  machine are configured for Qwen Flash. Know which one you mean.
- **"Other users can connect" was not true until last night's fix**, and it is
  still unproven with a real second account.
- **No usage numbers exist** — no accept rate, no time saved, no users beyond
  you.

## Decisions for you

1. **Database: Neon free tier (≈ $0) or a Fly Postgres machine (≈ $2.34)?**
   I'd take Neon; it scales to zero, which suits two sweeps a day.
2. **Scheduler: GitHub Actions (free, set up) or an always-on Fly timer
   (≈ $2.19)?** I'd take GitHub Actions. It cannot do time zones, so sweeps
   shift an hour in winter, and GitHub pauses schedules after 60 days of repo
   inactivity.
3. **Validate link compaction before trusting it?** One run of
   `scripts/compare-extractors.ts` on your 52-email fixture costs cents. Until
   then, `LLM_COMPACT_LINKS=false` is the safe setting. I left it on.
4. **Try Haiku 5.5?** List price is a tenth of Haiku 4.5 and no code change is
   needed. It needs the same A/B run. Worth doing in the same sitting as 3.
5. **Keep the sender-mute rule on?** It is the only filter that learns, so it
   is the one that could miss something from a sender that changes behaviour.
   Every 5th email still gets through. `PREFILTER_SENDER_HISTORY=false` turns
   it off at a cost of about 5 calls per two weeks.
6. **Restore the Oct 2 dump or start clean?** The dump holds a Google refresh
   token. Starting clean means signing in again and losing nothing else that
   matters, since data is purged after 14 days anyway.
7. **Merge `feature/group-availability`?** It is inert with the flag off. See
   below.

## Not verified

- Anything against a real Gmail inbox, Google Calendar or model. By design.
- The streamed cron route on Fly.
- Onboarding and the dashboard in a browser. They build; I did not click
  through them.
- The GitHub Actions workflows have never run.

## Known issues I left alone

- The Settings page toggles, keyword list, calendar id and time zone are not
  saved anywhere, and the "Connected inbox" row shows a hardcoded address and
  claims real-time push.
- Gmail push and Maybe-reminders are in the code but never activated.
- Events from calendar attachments and the Handshake feed all get 3 stars.
- `/api/calendar.ics` serves one user picked by an env var.
- `Event.date` is the UTC date, so an 8 PM New York event is stored under the
  next day. Nothing reads the field today.
- `scripts/*.ts` import `dotenv`, which is only present as a transitive
  dependency.

## Group scheduling

Started on `feature/group-availability`, behind `FEATURE_GROUP_SCHEDULING`.
Done and tested: computing free slots from a calendar, finding when several
people overlap, a text export, and signed expiring share links that carry free
time only. Written but never run end to end: the two API routes and the public
page. Not started: a UI, and a way for someone without Lumi to add their
times. Details in `docs/GROUP_SCHEDULING.md` on that branch.
