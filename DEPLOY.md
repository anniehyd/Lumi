# Deploying Lumi to AWS (single EC2 box)

Stack: one t3.small running docker compose — Next.js app, BullMQ worker
(scans Gmail every `INGEST_POLL_MINUTES`), Postgres, Redis, and Caddy
terminating HTTPS for a DuckDNS domain.

## One-time setup

1. **AWS credentials** (own account, kept separate from the default profile):
   `aws configure --profile annie`

2. **DuckDNS**: claim a subdomain at https://www.duckdns.org (login with
   Google/GitHub). After provisioning, point it at the Elastic IP printed by
   the script — either in the DuckDNS dashboard or:
   `curl "https://www.duckdns.org/update?domains=<sub>&token=<token>&ip=<elastic-ip>"`

3. **Google OAuth client** (browser only, no CLI exists):
   - https://console.cloud.google.com → create project `lumi`
   - Enable **Gmail API** and **Google Calendar API** (APIs & Services → Library)
   - OAuth consent screen: External, add yourself as a **test user**
   - Credentials → Create OAuth client ID → Web application:
     - Authorized origin: `https://<sub>.duckdns.org`
     - Redirect URI: `https://<sub>.duckdns.org/api/auth/callback/google`
   - Put client ID/secret into `.env.production`

4. **Anthropic API key**: https://console.anthropic.com → `.env.production`

5. Fill in `.env.production`: `NEXTAUTH_URL=https://<sub>.duckdns.org` and
   `CALENDAR_FEED_EMAIL=<the Gmail you sign in with>`.

6. **Apple Calendar** (after deploy + first sign-in): on iPhone,
   Settings → Apps → Calendar → Calendar Accounts → Add Account → Other →
   Add Subscribed Calendar (on Mac: Calendar → File → New Calendar
   Subscription) and paste
   `https://<sub>.duckdns.org/api/calendar.ics?token=<CALENDAR_FEED_TOKEN>`.
   Every event you Accept (or mark Maybe) appears with title, summary,
   location, and RSVP link. Apple refreshes subscribed calendars on its own
   schedule — set the account's refresh to hourly if offered.

## Provision + deploy

```bash
AWS_PROFILE=annie ./deploy/provision.sh          # prints Elastic IP
# point DuckDNS at that IP, then:
./deploy/sync.sh <elastic-ip> <sub>.duckdns.org
```

Re-run `sync.sh` any time to ship code changes. First visit the site, sign in
with Google (grant Gmail + Calendar), and the worker takes over from there —
it scans the inbox every 10 minutes even with your laptop off.

## Ops

```bash
ssh -i ~/.ssh/lumi-key.pem ubuntu@<ip>
docker compose -f ~/lumi/docker-compose.prod.yml logs -f worker   # scan activity
docker compose -f ~/lumi/docker-compose.prod.yml ps
```

Cost: ~$17/mo (t3.small + 30GB gp3 + Elastic IP attached to a running box).
