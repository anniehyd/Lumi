import { google, gmail_v1 } from "googleapis";
import { simpleParser } from "mailparser";
import { getGoogleAccessToken } from "@/lib/auth";

/**
 * Gmail service — list, fetch, and parse messages for a user.
 * Uses the account access token (refreshed on demand) from lib/auth.
 */

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
 * Default looks at last 30 days of inbox mail, excluding obvious junk.
 */
export async function listMessages(
  userId: string,
  opts: { query?: string; maxResults?: number } = {}
): Promise<string[]> {
  const gmail = await clientFor(userId);
  if (!gmail) return [];
  const res = await gmail.users.messages.list({
    userId: "me",
    q: opts.query ?? "newer_than:30d -category:promotions -category:social",
    maxResults: opts.maxResults ?? 50,
  });
  return (res.data.messages ?? []).map((m) => m.id!).filter(Boolean);
}

export async function fetchMessage(
  userId: string,
  gmailId: string
): Promise<ParsedMessage | null> {
  const gmail = await clientFor(userId);
  if (!gmail) return null;

  const res = await gmail.users.messages.get({
    userId: "me",
    id: gmailId,
    format: "raw",
  });
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

  const res = await gmail.users.watch({
    userId: "me",
    requestBody: {
      topicName: topic,
      labelIds: ["INBOX"],
      labelFilterAction: "include",
    },
  });
  return res.data.historyId ?? null;
}
