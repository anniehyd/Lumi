import { google, gmail_v1 } from "googleapis";
import { simpleParser, type AddressObject, type ParsedMail } from "mailparser";
import { getGoogleAccessToken } from "@/lib/auth";
import { withRetry } from "@/lib/retry";

/**
 * Gmail service — list, fetch, and parse messages for a user.
 * Uses the account access token (refreshed on demand) from lib/auth.
 */

/**
 * Which mail Lumi is allowed to look at, in Gmail search syntax. Every path
 * into the detection pipeline (scheduled sweep, manual scan, push webhook)
 * appends this, so it is the one place that decides what the pipeline — and
 * therefore any Claude call — ever sees.
 *
 * Default: the inbox only, minus Gmail's own ad-ish categories. `in:inbox`
 * drops archived and sent mail; the category exclusions drop Promotions,
 * Social, Updates, and Forums. Written as exclusions rather than
 * `category:primary` so it still behaves when inbox tabs are turned off.
 *
 * Override with INGEST_GMAIL_FILTER to hand-curate, e.g. `label:Lumi` to read
 * only what a Gmail filter of your own has labelled.
 */
export const MAIL_FILTER =
  process.env.INGEST_GMAIL_FILTER?.trim() ||
  "in:inbox -category:promotions -category:social -category:updates -category:forums";

export type ParsedMessage = {
  messageId: string;
  threadId: string;
  gmailId: string;
  from: string;
  subject: string;
  receivedAt: Date;
  bodyText: string;
  bodyHtml: string;
  hasIcs: boolean;
  icsContent?: string;
  /** Carried a List-Unsubscribe header, i.e. it is list / marketing mail. */
  listUnsubscribe: boolean;
  /** Addresses in To/Cc/Delivered-To/X-Forwarded-To; empty when not parsed from raw. */
  recipients?: string[];
};

async function clientFor(userId: string): Promise<gmail_v1.Gmail | null> {
  const token = await getGoogleAccessToken(userId);
  if (!token) return null;
  const oauth2 = new google.auth.OAuth2();
  oauth2.setCredentials({ access_token: token });
  return google.gmail({ version: "v1", auth: oauth2 });
}

/**
 * List unread/recent messages. `query` follows Gmail search syntax.
 * Default looks at the last 14 days of mail that passes MAIL_FILTER.
 */
export async function listMessages(
  userId: string,
  opts: { query?: string; maxResults?: number } = {}
): Promise<string[]> {
  const gmail = await clientFor(userId);
  if (!gmail) return [];
  const res = await withRetry(
    () =>
      gmail.users.messages.list({
        userId: "me",
        q: opts.query ?? `newer_than:14d ${MAIL_FILTER}`,
        maxResults: opts.maxResults ?? 50,
      }),
    { label: "gmail.list" }
  );
  return (res.data.messages ?? []).map((m) => m.id!).filter(Boolean);
}

export async function fetchMessage(
  userId: string,
  gmailId: string
): Promise<ParsedMessage | null> {
  const gmail = await clientFor(userId);
  if (!gmail) return null;

  const res = await withRetry(
    () => gmail.users.messages.get({ userId: "me", id: gmailId, format: "raw" }),
    { label: "gmail.get" }
  );
  const raw = res.data.raw;
  if (!raw) return null;

  return parseRawMessage(Buffer.from(raw, "base64url"), {
    gmailId,
    threadId: res.data.threadId ?? "",
    fallbackMessageId: res.data.id ?? gmailId,
  });
}

/**
 * Parse one RFC 5322 message into the shape the detection pipeline takes.
 *
 * The single parser for every way mail reaches Lumi: Gmail hands over the raw
 * message, and the inbound-forwarding webhook (src/lib/services/inbound.ts)
 * passes the raw message the provider relayed. Keeping one function here is
 * what guarantees a forwarded email produces the same Email row as the same
 * email read from Gmail.
 */
export async function parseRawMessage(
  raw: Buffer | string,
  opts: { gmailId?: string; threadId?: string; fallbackMessageId: string }
): Promise<ParsedMessage> {
  const parsed = await simpleParser(raw);

  const messageIdHeader = (parsed.messageId ?? opts.fallbackMessageId).replace(/[<>]/g, "");

  const fromText =
    parsed.from?.text ?? (typeof parsed.from === "string" ? parsed.from : "");

  // Find any .ics attachment.
  let icsContent: string | undefined;
  for (const att of parsed.attachments ?? []) {
    const isIcs =
      att.contentType?.includes("calendar") ||
      att.filename?.toLowerCase().endsWith(".ics");
    if (isIcs && att.content) {
      icsContent = att.content.toString("utf8");
      break;
    }
  }

  return {
    messageId: messageIdHeader,
    threadId: opts.threadId ?? "",
    gmailId: opts.gmailId ?? "",
    from: fromText,
    subject: parsed.subject ?? "",
    receivedAt: parsed.date ?? new Date(),
    bodyText: parsed.text ?? "",
    bodyHtml: typeof parsed.html === "string" ? parsed.html : "",
    hasIcs: !!icsContent,
    icsContent,
    listUnsubscribe: hasListUnsubscribe(parsed),
    recipients: recipientAddresses(parsed),
  };
}

/**
 * mailparser folds every List-* header into one `list` entry
 * ({ unsubscribe: {...}, ... }); it is never exposed as "list-unsubscribe".
 * Check both so the signal survives a parser upgrade either way.
 */
function hasListUnsubscribe(parsed: ParsedMail): boolean {
  if (parsed.headers.has("list-unsubscribe")) return true;
  const list = parsed.headers.get("list");
  return typeof list === "object" && list !== null && "unsubscribe" in list;
}

/**
 * Every address the message was addressed or delivered to: To, Cc,
 * Delivered-To and X-Forwarded-To (which Gmail adds when a filter forwards).
 * The inbound path reads the forwarding token out of these.
 */
function recipientAddresses(parsed: ParsedMail): string[] {
  const out: string[] = [];
  const addAddressObject = (v: AddressObject | AddressObject[] | undefined) => {
    for (const obj of Array.isArray(v) ? v : v ? [v] : []) {
      for (const a of obj.value) if (a.address) out.push(a.address);
    }
  };
  addAddressObject(parsed.to);
  addAddressObject(parsed.cc);
  for (const name of ["delivered-to", "x-forwarded-to", "x-original-to"]) {
    const v = parsed.headers.get(name);
    const texts = Array.isArray(v) ? v : v ? [v] : [];
    for (const t of texts) {
      if (typeof t === "string") out.push(...t.split(",").map((s) => s.trim()).filter(Boolean));
      else if (typeof t === "object" && "value" in t) addAddressObject(t as AddressObject);
    }
  }
  return out;
}

/**
 * Register a Gmail push notification watch on the user's INBOX.
 * Requires GMAIL_PUBSUB_TOPIC env var. Returns the historyId baseline.
 */
export async function startWatch(userId: string): Promise<string | null> {
  const topic = process.env.GMAIL_PUBSUB_TOPIC;
  if (!topic) return null;
  const gmail = await clientFor(userId);
  if (!gmail) return null;

  const res = await withRetry(
    () =>
      gmail.users.watch({
        userId: "me",
        requestBody: {
          topicName: topic,
          labelIds: ["INBOX"],
          labelFilterAction: "include",
        },
      }),
    { label: "gmail.watch" }
  );
  return res.data.historyId ?? null;
}
