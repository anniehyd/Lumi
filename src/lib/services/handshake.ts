import { parseIcs } from "@/lib/detection/ics";
import type { ExtractedEvent } from "@/lib/detection/types";
import { withRetry } from "@/lib/retry";

/**
 * Handshake source — reads the user's personal iCal export feed.
 *
 * Handshake has no student-facing API (API access is granted only to Career
 * Services partner institutions), but every account exposes a live-updating
 * iCal URL under Settings → Calendar export → "Copy calendar link". That feed
 * carries the events, appointments, interview schedules and career fairs
 * attached to the account, which is exactly what Lumi wants to track — and it
 * arrives as ICS, so it rides the existing tier-1 detection path with no LLM
 * spend.
 *
 * Note this feed is *commitments*, not discovery: it holds what the account is
 * already attached to, not the whole Handshake event catalog. Discovery still
 * comes through Handshake's own mail (handshake@mail.joinhandshake.com), which
 * the Gmail pipeline already reads. See docs/handshake.md.
 */

/** Hosts we're willing to fetch. The feed URL is user input driving a
 *  server-side request, so it is allowlisted rather than merely validated. */
const ALLOWED_HOST = /(^|\.)joinhandshake(-eu)?\.com$/i;

const FETCH_TIMEOUT_MS = 15_000;
const MAX_FEED_BYTES = 5 * 1024 * 1024;

export class HandshakeFeedError extends Error {}

/**
 * Normalize what a user pastes into a fetchable https URL.
 * Handshake's "Copy calendar link" hands out a webcal:// URL; browsers and
 * calendar clients special-case that scheme, fetch() does not.
 */
export function normalizeFeedUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new HandshakeFeedError("Feed URL is empty");

  let url: URL;
  try {
    url = new URL(trimmed.replace(/^webcal:\/\//i, "https://"));
  } catch {
    throw new HandshakeFeedError(`Not a valid URL: ${trimmed}`);
  }

  if (url.protocol !== "https:") {
    throw new HandshakeFeedError(`Feed URL must be https (got ${url.protocol})`);
  }
  if (!ALLOWED_HOST.test(url.hostname)) {
    throw new HandshakeFeedError(
      `Refusing to fetch ${url.hostname} — Handshake feeds live on joinhandshake.com`
    );
  }
  return url.toString();
}

/** Fetch the raw ICS body for a feed URL. */
export async function fetchFeed(feedUrl: string): Promise<string> {
  const url = normalizeFeedUrl(feedUrl);
  const res = await withRetry(
    async () => {
      const r = await fetch(url, {
        headers: { Accept: "text/calendar, text/plain;q=0.9" },
        redirect: "follow",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (r.status === 429 || r.status >= 500) {
        throw Object.assign(new Error(`Handshake feed returned ${r.status}`), { status: r.status });
      }
      return r;
    },
    { label: "handshake.feed" }
  );

  if (!res.ok) {
    // A rotated or revoked calendar link 401/404s — worth saying plainly,
    // because the fix is to re-copy it out of Handshake settings.
    throw new HandshakeFeedError(
      `Handshake feed returned ${res.status} ${res.statusText}. ` +
        `If this persists, re-copy the calendar link from Handshake settings.`
    );
  }

  const body = await res.text();
  if (body.length > MAX_FEED_BYTES) {
    throw new HandshakeFeedError(
      `Feed is ${body.length} bytes, over the ${MAX_FEED_BYTES} cap`
    );
  }
  if (!/BEGIN:VCALENDAR/i.test(body)) {
    throw new HandshakeFeedError(
      "Feed did not return iCalendar data — check the URL is the calendar " +
        "export link and not a Handshake page URL"
    );
  }
  return body;
}

/**
 * Fetch + parse a Handshake feed into extracted events.
 * UIDs are namespaced so a Handshake event can never collide with an ICS
 * attachment that happens to reuse the same UID.
 */
export async function fetchHandshakeEvents(
  feedUrl: string
): Promise<ExtractedEvent[]> {
  const ics = await fetchFeed(feedUrl);
  // Organizer is left exactly as the feed reports it (the employer or the
  // career center) — overwriting it with "Handshake" would both misattribute
  // the event and break the title+date+organizer dedup against the same event
  // arriving by email.
  return parseIcs(ics).map((e) => ({
    ...e,
    sourceUid: e.sourceUid ? `handshake:${e.sourceUid}` : undefined,
  }));
}
