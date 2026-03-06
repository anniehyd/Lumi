# 📬 Lumi

**AI-powered email-to-calendar assistant.** Lumi scans your inbox, detects event invitations, extracts structured details, and adds them to your calendar with one click.

![License](https://img.shields.io/badge/license-MIT-blue)
![Next.js](https://img.shields.io/badge/Next.js-15-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)

---

## How It Works

```
Email arrives → Detection → LLM Extraction → Event Card → User decides → Calendar sync
```

1. **Ingestion** — Gmail API push notifications (or IMAP polling) deliver new emails
2. **Detection** — Tiered classifier: ICS attachments → schema.org markup → keyword match → LLM fallback
3. **Extraction** — Claude `tool_use` extracts structured event JSON (title, date, time, location, organizer, attire, RSVP)
4. **Dashboard** — Clean card UI presents events with Attend / Maybe / Decline actions
5. **Calendar** — Accepted events are written to Google Calendar with reminders and conflict detection

## Architecture

```
┌─────────────┐   webhook/poll   ┌──────────────┐
│  Gmail API   │────────────────▸│  Ingestion   │
│  IMAP Server │                  │  Worker      │
└─────────────┘                  └──────┬───────┘
                                        │ enqueue
                                        ▼
                                 ┌──────────────┐
                                 │  Detection   │──▸ ICS? → parse directly
                                 │  Classifier  │──▸ HTML schema? → parse
                                 └──────┬───────┘──▸ ambiguous? → LLM
                                        │
                                        ▼
                                 ┌──────────────┐
                                 │  LLM Extract │  Claude tool_use
                                 │  (if needed) │  structured JSON out
                                 └──────┬───────┘
                                        │
                                        ▼
                                 ┌──────────────┐  ┌─────────────┐
                                 │  Event Store │─▸│  Dashboard  │
                                 │  (Postgres)  │  │  (Next.js)  │
                                 └──────┬───────┘  └──────┬──────┘
                                        │                 │ user action
                                        ▼                 ▼
                                 ┌──────────────┐  ┌─────────────┐
                                 │  Scheduler   │  │  Calendar   │
                                 │  (reminders) │  │  API Write  │
                                 └──────────────┘  └─────────────┘
```

## Tech Stack

| Layer         | Technology                                       |
|---------------|--------------------------------------------------|
| Frontend      | Next.js 15, React 19, Tailwind CSS, Framer Motion |
| Backend       | Next.js API routes, BullMQ (Redis)               |
| Database      | PostgreSQL 16 + Prisma ORM                       |
| Email         | Gmail API + Pub/Sub, IMAP fallback               |
| Calendar      | Google Calendar API                              |
| LLM           | Claude Sonnet via Anthropic API (`tool_use`)     |
| Auth          | NextAuth.js (Google OAuth)                       |
| Validation    | Zod                                              |

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL 16+
- Redis 7+
- Google Cloud project with Gmail + Calendar APIs enabled
- Anthropic API key

### 1. Clone & install

```bash
git clone https://github.com/yourname/lumi.git
cd lumi
npm install
```

### 2. Set up environment

```bash
cp .env.example .env.local
```

Fill in the values in `.env.local` (see [Environment Variables](#environment-variables) below).

### 3. Set up database

```bash
npx prisma migrate dev --name init
npx prisma generate
```

### 4. Run development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 5. (Optional) Start the worker for background jobs

```bash
npm run worker
```

## Environment Variables

| Variable                         | Description                          |
|----------------------------------|--------------------------------------|
| `DATABASE_URL`                   | Postgres connection string           |
| `REDIS_URL`                      | Redis connection string              |
| `NEXTAUTH_URL`                   | App URL (http://localhost:3000)      |
| `NEXTAUTH_SECRET`                | Random secret for NextAuth           |
| `GOOGLE_CLIENT_ID`               | Google OAuth client ID               |
| `GOOGLE_CLIENT_SECRET`           | Google OAuth client secret           |
| `GOOGLE_PUBSUB_TOPIC`           | Gmail Pub/Sub topic name             |
| `GOOGLE_PUBSUB_SUBSCRIPTION`    | Gmail Pub/Sub subscription name      |
| `ANTHROPIC_API_KEY`              | Anthropic API key for Claude         |

## Project Structure

```
lumi/
├── prisma/
│   └── schema.prisma          # Database schema
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── events/        # Event CRUD endpoints
│   │   │   ├── webhooks/gmail/ # Gmail push notification receiver
│   │   │   └── cron/reminders/ # Maybe-event reminder scheduler
│   │   ├── dashboard/         # Main dashboard page
│   │   ├── layout.tsx         # Root layout with auth provider
│   │   └── page.tsx           # Landing / auth gate
│   ├── components/
│   │   ├── EventCard.tsx      # Interactive event card
│   │   ├── EventFeed.tsx      # Scrollable event list
│   │   ├── DetailPanel.tsx    # Expanded event detail
│   │   └── MiniCalendar.tsx   # Sidebar calendar widget
│   └── lib/
│       ├── services/
│       │   ├── email.ts       # Gmail API + IMAP ingestion
│       │   ├── detector.ts    # Event detection pipeline
│       │   ├── extractor.ts   # Claude LLM extraction
│       │   ├── calendar.ts    # Google Calendar write
│       │   └── scheduler.ts   # BullMQ reminder jobs
│       ├── schemas/
│       │   └── event.ts       # Zod schemas + types
│       └── utils/
│           ├── ics-parser.ts  # ICS/iCal parsing
│           └── dedup.ts       # Email deduplication
├── scripts/
│   └── seed-test-emails.ts    # Dev seed script
├── .env.example
├── .github/workflows/ci.yml
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── README.md
```

## MVP Phases

| Phase | Scope                | Timeline  |
|-------|----------------------|-----------|
| 1     | Email parsing        | Week 1–2  |
| 2     | Event extraction     | Week 3–4  |
| 3     | UI dashboard         | Week 5–6  |
| 4     | Calendar automation  | Week 7–8  |

See the interactive [Product Design Spec](src/app/dashboard/design-spec.tsx) for full details on architecture, schemas, edge cases, and tech decisions.

## License

MIT — see [LICENSE](LICENSE).
