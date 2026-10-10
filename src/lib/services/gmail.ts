import { google, gmail_v1 } from "googleapis";
import { simpleParser } from "mailparser";
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

  const buffer = Buffer.from(raw, "base64url");
  const parsed = await simpleParser(buffer);

  const messageIdHeader =
    (parsed.messageId ?? res.data.id ?? gmailId).replace(/[<>]/g, "");

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
    threadId: res.data.threadId ?? "",
    gmailId,
    from: fromText,
    subject: parsed.subject ?? "",
    receivedAt: parsed.date ?? new Date(),
    bodyText: parsed.text ?? "",
    bodyHtml: typeof parsed.html === "string" ? parsed.html : "",
    hasIcs: !!icsContent,
    icsContent,
    listUnsubscribe: parsed.headers.has("list-unsubscribe"),
  };
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
