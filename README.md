# Lumi

**Every invite, sorted.** Lumi reads the newsletters and announcements in a
student's inbox, pulls out the events, ranks them by how well they fit you,
and asks one question per event: attending? Yes goes straight to Google
Calendar. Nothing lands there until you say so.

It also answers the question that follows every event: *when can all of us
make it?* A Lumi poll is a link your group paints their free time on; Lumi
picks the slots everyone shares and puts the winner on your calendar.

![License](https://img.shields.io/badge/license-MIT-blue)
![Next.js](https://img.shields.io/badge/Next.js-15-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)

![Lumi dashboard — "Looks like it's gonna be a busy week", with the extracted events ranked below](docs/demo.png)

**Status (October 2026).** The hosted instance was switched off on October 2
for cost and has not been redeployed. Everything runs locally: demo mode
needs no credentials (`npm install && npm run dev`), and
[docs/lumi-demo.html](docs/lumi-demo.html) is a single file you can open in
any browser.

## What it does

**Today.** One sentence about the week ("Looks like it's gonna be a busy
week"), then the events still waiting for a decision, most relevant first.
Each card leads with a plain sentence about where it came from and who it is
for, then the title, time, place, and the paragraph of the email Lumi found
it in. Attend, Maybe or Skip; `J` `K` `A` `M` `D` on the keyboard.

**Calendar.** A schedule of the coming weeks with full titles, places and
status, plus month and week grids. Solid ink means on Google Calendar, an
outline means still undecided.

**Find a time with others.** Make a poll, share the link. Nobody else needs
an account: they press and drag over the slots they are free for, and the
page shows a heatmap, the best stretches ranked by how many people share
them, and who is missing from each. The organizer picks one; it becomes an
accepted event and syncs to their calendar.

**Three ways in.**

| Source | How | Needs |
|---|---|---|
| Gmail | Lumi sweeps the inbox tab twice a day (1 PM and 7 PM New York), only mail newer than the last sweep, never Promotions, Social, archived or sent mail | Google sign-in with read-only Gmail scope |
| Forward to Lumi | A private `lumi+<token>@` address; forward a newsletter, or set a Gmail filter to forward automatically | Nothing. No Google permission at all |
| Handshake | Your personal calendar export link, pulled on every sweep | The link from Handshake → Settings → Calendar export |

**Settings.** Every control does something: the connected inbox and a Scan
now button, your forwarding address, Handshake, the interest profile Lumi
ranks against, your pipeline numbers for the week, and a private iCal
subscription link for Apple Calendar.

## How it works

```
Email → Detection → Extraction + relevance → Conflict check → Card → You decide → Calendar
```

1. **Ingestion.** Gmail, the forwarding address, and the Handshake feed all
   land in the same pipeline.
2. **Detection.** Free and exact first: a calendar attachment, then schema.org
   markup. Then a keyword gate and a rule-based pre-filter (surveys, mail with
   no date or time, duplicates, replies that add nothing, bulk senders with
   no track record) before any model call. In a two-week sample of 405
   emails, 34 reached the model.
3. **Extraction.** One forced-tool call per email: every event in it, a
   1–5 relevance score against your profile, and the "Looks like…" sentence.
4. **Guards.** Past events dropped, the same event from two senders deduped,
   overlaps with your Google Calendar flagged (never decided for you).
5. **Decision.** Attend writes to Google Calendar. Walking it back removes it.

The stage-by-stage file map, data model and failure handling are in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Cost is in
[docs/COST.md](docs/COST.md), the metrics in [docs/METRICS.md](docs/METRICS.md),
Handshake in [docs/handshake.md](docs/handshake.md).

## Running it

### Demo mode, nothing to configure

```bash
git clone https://github.com/anniehyd/Lumi.git
cd Lumi
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The inbox fills from a
real NYU Wasserman newsletter, the sample poll lives at
`/meet/demo-study-group`, and nothing is written anywhere.

### Modes

| Mode | Database | Google OAuth | Model key | What works |
|---|---|---|---|---|
| **Demo** | — | — | — | Full UI on sample data (the default) |
| **Persisted** | ✓ | — | — | Real database; forwarding address and polls persist |
| **Live** | ✓ | ✓ | ✓ | Gmail sweeps, extraction, Google Calendar sync |

### Persisted and live

```bash
cp .env.example .env        # fill in what the mode needs; see the table below
docker compose up -d        # Postgres on 5432 (Redis only matters with INGEST_MODE=queue)
npx prisma db push
npm run db:seed             # optional: the newsletter sample into the database
npm run dev
```

Sweeps in live mode: either `npm run worker` (a timer at the times in
`INGEST_SWEEP_TIMES`, no Redis) or any external scheduler calling
`POST /api/cron/sweep` with the bearer `CRON_SECRET`. The GitHub Actions
workflow in `.github/workflows/sweep.yml` does the latter once the
`LUMI_URL` and `CRON_SECRET` secrets exist.

### Tests

```bash
npm run typecheck
npm run lint
npm run test:run        # ~300 tests on mocks and fixtures; any network call throws
npm run eval:prefilter  # replay eval/golden through the pre-filter
```

## Environment variables

All keys live in `.env.example`.

| Variable | Needed for | Notes |
|---|---|---|
| `DATABASE_URL` | Persisted, live | Defaults to the Docker Compose Postgres |
| `NEXTAUTH_URL`, `NEXTAUTH_SECRET` | Auth | `http://localhost:3000` locally; `openssl rand -base64 32` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Live | OAuth app with Gmail read-only and Calendar events scopes |
| `ANTHROPIC_API_KEY` | Extraction | Or `LLM_API_KEY` + `LLM_BASE_URL` for Qwen and any OpenAI-compatible endpoint |
| `LLM_MODEL` | Extraction | Default `claude-haiku-4-5`; `claude*` routes to Anthropic, anything else to the compatible endpoint |
| `LLM_COMPACT_LINKS` | Extraction | `true` (default) swaps URLs for placeholders before the model call |
| `PREFILTER_SENDER_HISTORY` | Detection | `true` (default) mutes bulk senders that never produce events |
| `INGEST_MODE` | Sweeps | `inline` (default, no Redis) or `queue` (BullMQ, needs `REDIS_URL`) |
| `INGEST_GMAIL_FILTER` | Gmail | Gmail search terms bounding what Lumi may read; default inbox only |
| `INGEST_SWEEP_TIMES`, `INGEST_SWEEP_TZ` | Worker | Default `13:00,19:00` in `America/New_York`; empty disables |
| `CRON_SECRET` | External sweeps | Enables `POST /api/cron/sweep`; unset returns 503 |
| `INBOUND_EMAIL_DOMAIN` | Forwarding | Domain of the `lumi+<token>@` addresses, MX pointed at Postmark; empty hides the feature |
| `INBOUND_WEBHOOK_SECRET` | Forwarding | Shared secret Postmark presents on `POST /api/ingest/inbound` |
| `HANDSHAKE_ICS_URL` | Handshake | Single-user fallback; the per-user link is set in Settings |
| `GMAIL_PUBSUB_TOPIC`, `GMAIL_WEBHOOK_SECRET` | Gmail push | Optional; present in the code, not activated |
| `CALENDAR_FEED_TOKEN`, `CALENDAR_FEED_EMAIL` | Legacy feed | Only for subscriptions made before per-user feed links |
| `LUMI_DEMO_USER_EMAIL` | Demo | Which account demo mode shows when the database has several |
| `LUMI_USE_MOCK_FALLBACK` | Demo | `true` (default) serves sample data when there is no database |

## API

| Route | Purpose |
|---|---|
| `GET /api/events` | Events, optional `?status=PENDING` |
| `GET/PATCH /api/events/[id]` | One event; PATCH changes status and drives calendar sync |
| `GET /api/events/[id]/ics` | One event as `.ics` |
| `POST/DELETE /api/events/[id]/sync` | Write to or remove from Google Calendar |
| `GET /api/emails/[id]` | The email an event came from |
| `GET /api/calendar.ics?token=…` | Per-user iCal feed of accepted and maybe events |
| `GET/POST /api/calendar-feed` | Mint or rotate the signed-in user's feed link |
| `POST /api/meet`, `GET /api/meet` | Create a poll; list yours |
| `GET /api/meet/[slug]` | Poll, every answer, ranked common times |
| `PUT /api/meet/[slug]/respond` | Save one person's free slots, no account |
| `POST /api/meet/[slug]/final` | Owner picks the time; synced to their calendar |
| `GET /api/meet/[slug]/final.ics` | The picked time as `.ics`, for everyone else |
| `GET/PUT /api/profile` | Interest profile and onboarding flag |
| `GET /api/metrics` | Signed-in user's funnel, `?days=7` |
| `GET/POST /api/miss` | "Lumi missed something" reports |
| `GET /api/sync/status` | Last scan and database connectivity |
| `POST /api/ingest/poll` | Scan now: Gmail plus Handshake |
| `POST /api/ingest/inbound` | Postmark inbound webhook for forwarded mail |
| `GET/POST /api/sources/forwarding` | The user's forwarding address; POST rotates it |
| `GET/PUT/DELETE /api/sources/handshake` | Connect or disconnect the Handshake feed |
| `POST /api/cron/sweep` | Run a sweep, bearer `CRON_SECRET` |

## Project structure

```
prisma/schema.prisma      database schema
src/app/                  pages: dashboard, calendar, events, meet, onboarding, settings
src/app/api/              routes listed above
src/components/           EventFeed, EventCard, MeetGrid, StarCursor, Nav, ProfileEditor, MetricsCard
src/lib/brief.ts          the "Looks like…" headline and per-event fallback sentence
src/lib/meet.ts           poll grid, slot keys, best-time ranking
src/lib/meetStore.ts      Prisma or in-memory poll storage
src/lib/detection/        ics, schema.org, keyword gate, pre-filter
src/lib/services/         gmail, inbound, ingest, detect, extract, calendar, sweep, handshake
src/lib/                  auth, apiAuth, dataSource, feedToken, forwardingToken, metrics, retry, profile
scripts/                  seed, weekly metrics, golden-set snapshot, extractor A/B, pre-filter replay
docs/                     architecture, cost, metrics, handshake, the single-file demo
```

## Tech

Next.js 15, React 19, Tailwind, Prisma on PostgreSQL, NextAuth with Google,
Gmail and Google Calendar APIs, Claude (or any OpenAI-compatible model) via
forced tool use, Vitest. Fraunces and Bricolage Grotesque for the type.

## License

MIT, see [LICENSE](LICENSE).
