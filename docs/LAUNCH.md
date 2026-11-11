# Opening Lumi to anyone

What it takes to go from "people I added by hand" to "anyone with a Google
account can sign in", and what keeps the bill bounded once they can.

## Why you were adding people one at a time

A Google OAuth app starts in **Testing**. In Testing only addresses on the
test-user list can sign in, the list tops out at 100, and every refresh token
expires after 7 days, so connected inboxes silently stop being scanned a week
later. None of that is in Lumi's code; it is one switch in Google Cloud.

## The switch (about five minutes, free)

Google Cloud console → the project that owns Lumi's OAuth client →
**Google Auth Platform**:

1. **Branding**: app name `Lumi`, your support email, and
   - Application home page: `https://<host>/`
   - Privacy policy: `https://<host>/privacy`
   - Terms of service: `https://<host>/terms`
2. **Clients** → the web client → Authorized redirect URIs must include
   `https://<host>/api/auth/callback/google`.
3. **Data access**: leave only `openid`, `email`, `profile`,
   `gmail.readonly` and `calendar.events`.
4. **Audience** → **Publish app** → confirm. Status becomes *In production*.

From that moment anyone can sign in. Sign-in asks for name and email only,
which needs no review. Delete the test-user list; it no longer does anything.

## What Google still limits, and what it would cost to lift

Connecting Gmail and Calendar is a second, optional step, and those scopes
are reviewed:

| | Without verification | To verify |
|---|---|---|
| Sign in (`openid email profile`) | Unlimited, no warning | Nothing to do |
| Calendar (`calendar.events`, sensitive) | "Google hasn't verified this app" screen; 100 users, lifetime | Free review, a few weeks; needs a domain you own, the privacy page, a demo video |
| Gmail (`gmail.readonly`, restricted) | Same screen, same 100 | The same review **plus** a yearly third-party security assessment (CASA), which is paid |

So for a launch this week: publish, and the first 100 people who connect
Gmail go through one extra click (Advanced → Go to Lumi). The onboarding copy
already tells them to expect it. `/admin` shows how many of the 100 are used.

The route that never hits this limit is **forwarding**: a user forwards
newsletters to a private `lumi+<token>@…` address and grants Google nothing.
The code is in place (`POST /api/ingest/inbound`); it needs a domain and an
inbound-mail provider, set with `INBOUND_EMAIL_DOMAIN` and
`INBOUND_WEBHOOK_SECRET`. That is the thing to wire before user 100, and it
is far cheaper than a Gmail security assessment.

## What keeps the bill bounded

Hosting is flat: one Fly machine that stops when idle, one small Postgres,
sweeps triggered twice a day by GitHub Actions. The only cost that grows with
users is model calls, and three settings cap it (`src/lib/limits.ts`):

| Setting | Live value | Effect |
|---|---|---|
| `LUMI_MAX_USERS` | 100 | The 101st new person sees "the beta is full". Existing accounts are untouched. |
| `LUMI_USER_DAILY_USD` | 0.50 | One inbox cannot spend more than this on model calls in a day. |
| `LUMI_PAUSE_AFTER_DAYS` | 14 | Someone who stopped opening Lumi stops being scanned until they return. |

Worst case is therefore `users × daily budget`; the realistic figure is on
`/admin` as "at this week's pace".

## The operator view

`https://<host>/admin`, for addresses in `ADMIN_EMAILS` only (everyone else
gets a 404). It lists every account with what it reads from, whether its
scans are running, cards waiting, and model spend, plus room left under the
sign-up cap and Google's 100. It shows counts and timestamps, never mail.

```bash
fly secrets set ADMIN_EMAILS=you@example.com -a lumi-live
```

## Launch checklist

- [ ] Publish the OAuth app (above)
- [ ] `fly secrets set ADMIN_EMAILS=…` and, optionally, `LUMI_CONTACT_EMAIL=…`
- [ ] `fly deploy -c fly.live.toml -a lumi-live --remote-only` (the release
      step adds the two new `User` columns)
- [ ] Repository secrets `LUMI_URL` and `CRON_SECRET`, or the twice-daily
      sweep never fires
- [ ] Sign in with a second Google account that was never on the test list
- [ ] Read `/privacy` and `/terms` once; they are published in your name
