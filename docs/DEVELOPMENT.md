# Developing Lumi

## Run it on your machine

```bash
git clone https://github.com/anniehyd/Lumi.git
cd Lumi
npm install
npm run dev
```

Open the address `npm run dev` prints and choose **Try the demo**. The
dashboard fills with a sample inbox, a sample poll lives at
`/meet/demo-study-group`, and nothing is written anywhere.

Demo mode is on whenever `GOOGLE_CLIENT_ID` is unset. If your `.env` already
has Google credentials, the app starts in live mode instead, and the
dashboard asks you to sign in. To see the demo anyway, start it with the
variable cleared:

```bash
GOOGLE_CLIENT_ID= DATABASE_URL= npm run dev
```

## Modes

| Mode | Database | Google OAuth | Model key | What works |
|---|---|---|---|---|
| **Demo** | — | — | — | Full UI on sample data (the default) |
| **Persisted** | ✓ | — | — | Real database; forwarding address and polls persist |
| **Live** | ✓ | ✓ | ✓ | Gmail sweeps, extraction, Google Calendar sync |

## Persisted and live

```bash
cp .env.example .env        # fill in what the mode needs; see the README's variable table
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

## Tests

```bash
npm run typecheck
npm run lint
npm run test:run        # 350+ tests on mocks and fixtures; any network call throws
npm run eval:prefilter  # replay eval/golden through the pre-filter
```
