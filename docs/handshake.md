# Handshake source

## Why a calendar feed and not an API

Handshake's API is granted only to Career Services partner institutions — a
student account cannot obtain credentials, and the API is documented as
"as-is" with no new access being onboarded. What every account *does* have is a
personal iCal export that updates live.

Lumi reads that feed. It is ICS, so it enters the existing tier-1 detection
path: no LLM tokens, confidence 1.0.

## Connecting

1. Handshake → account icon (upper right) → **Settings**
2. **Calendar export** → **Copy calendar link** (a `webcal://` URL — that's fine,
   Lumi upgrades it to `https://`)
3. Either:
   - **Single-user deploys** (`lumi-live`): set `HANDSHAKE_ICS_URL` in the env
   - **Per user**: `PUT /api/sources/handshake` with `{"feedUrl": "webcal://..."}`

The `PUT` fetches the feed once before storing it, so a bad paste fails
immediately with a readable error instead of silently no-op'ing every sweep.
`GET` reports connection state; `DELETE` disconnects. Already-ingested events
survive a disconnect and age out on the normal 14-day purge.

> The link is a bearer credential — anyone holding it can read your Handshake
> calendar. `GET /api/sources/handshake` deliberately returns only the hostname,
> never the URL. If it leaks, rotating it in Handshake settings invalidates it.

## What the feed covers

Registered events, appointments, interview schedules and non-private career
fairs attached to the account — i.e. **commitments**, not the whole catalog.

Discovery is still the email path, and already works: NYU's Wasserman digests
and fair invitations arrive from `handshake@mail.joinhandshake.com` straight to
the inbox with no Gmail category label, so `INGEST_GMAIL_FILTER` passes them
through to detection.

## Ingestion

`ingestHandshake(userId)` runs inside the same BullMQ ingest job as the Gmail
sweep, and on every manual `POST /api/ingest/poll`. It is a no-op when no feed
is configured, and swallows its own fetch failures so a rotated link can never
take the Gmail sweep down with it.

Events persist through the shared `persistEvents`, so Handshake gets the same
guards as email: past-event filtering, Google Calendar conflict badges, and
dedup. Dedup runs in three tiers — namespaced ICS `UID`
(`handshake:<uid>`, unique per user, so re-fetching the same feed each sweep
never duplicates), then title+date+organizer, then fuzzy title overlap. That
last tier is what collapses a fair announced *both* in a Wasserman email and in
the feed into one card.

`Event.source` (`EMAIL` | `HANDSHAKE`) records provenance.

## Known gaps

- **Relevance is flat at 3★.** Every ICS-tier event skips the Claude call that
  assigns 1–5★, so Handshake events sort into the middle of the feed rather
  than by fit. This predates Handshake and affects email ICS attachments too;
  fixing it means a relevance-only extraction pass over ICS-derived events.
- **Job round-ups are unfiltered noise.** `handshake@g.joinhandshake.com` sends
  weekly "jobs round-up" mail (~1–2×/week) that is never event-bearing but
  carries deadline-ish copy the keyword gate may pass to the LLM. A negative
  keyword rule on that sender would cut wasted tokens.
