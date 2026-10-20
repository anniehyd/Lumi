import { timingSafeEqual } from "node:crypto";
import { parseRawMessage, type ParsedMessage } from "@/lib/services/gmail";

/**
 * Inbound email by forwarding — the path for users who grant no Gmail access.
 *
 * Provider: Postmark inbound (docs/ARCHITECTURE.md explains the choice). A
 * Postmark inbound stream with a custom domain delivers every message sent to
 * *@INBOUND_EMAIL_DOMAIN as one JSON POST to /api/ingest/inbound. With
 * "Include raw email content in JSON payload" switched on the POST carries
 * the full RFC 5322 message in `RawEmail`, which goes through the very same
 * parser Gmail mail does (parseRawMessage). Without it, the pre-parsed fields
 * are mapped instead; that still works but is the less faithful path.
 *
 * Nothing in here touches the database or the network: the route resolves
 * the user and hands the parsed message to ingestInbound.
 */

/** The subset of Postmark's inbound webhook JSON that Lumi reads. */
export type PostmarkInbound = {
  From?: string;
  FromName?: string;
  FromFull?: { Email?: string; Name?: string };
  To?: string;
  ToFull?: { Email?: string; Name?: string; MailboxHash?: string }[];
  Cc?: string;
  CcFull?: { Email?: string; Name?: string }[];
  OriginalRecipient?: string;
  Subject?: string;
  /** Postmark's own id for the message — not the RFC Message-ID. */
  MessageID?: string;
  Date?: string;
  TextBody?: string;
  HtmlBody?: string;
  Headers?: { Name?: string; Value?: string }[];
  Attachments?: { Name?: string; Content?: string; ContentType?: string }[];
  /** Present when the inbound stream includes raw content. */
  RawEmail?: string;
};

export type InboundSecretCheck = "ok" | "unconfigured" | "missing" | "mismatch";

function constantTimeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * The secret presented with a webhook call. Postmark has no signing; it
 * supports HTTP basic auth in the webhook URL, so that is the documented
 * form (https://anything:<secret>@host/api/ingest/inbound). A bearer header or
 * ?token= is accepted too, for curl and for providers that prefer them.
 */
export function presentedSecret(req: Request): string | null {
  const auth = req.headers.get("authorization") ?? "";
  if (/^bearer /i.test(auth)) return auth.slice(7).trim() || null;
  if (/^basic /i.test(auth)) {
    try {
      const decoded = Buffer.from(auth.slice(6).trim(), "base64").toString("utf8");
      const colon = decoded.indexOf(":");
      return (colon >= 0 ? decoded.slice(colon + 1) : decoded) || null;
    } catch {
      return null;
    }
  }
  const token = new URL(req.url).searchParams.get("token");
  return token || null;
}

export function checkInboundSecret(
  presented: string | null,
  secret: string | undefined = process.env.INBOUND_WEBHOOK_SECRET
): InboundSecretCheck {
  if (!secret?.trim()) return "unconfigured";
  if (!presented) return "missing";
  return constantTimeEqual(presented, secret.trim()) ? "ok" : "mismatch";
}

/** Every address the payload says the message was sent to, most specific first. */
export function recipientCandidates(payload: PostmarkInbound, parsed?: ParsedMessage): string[] {
  const out: string[] = [];
  if (payload.OriginalRecipient) out.push(payload.OriginalRecipient);
  for (const t of payload.ToFull ?? []) if (t.Email) out.push(t.Email);
  for (const c of payload.CcFull ?? []) if (c.Email) out.push(c.Email);
  if (payload.To) out.push(...splitAddressList(payload.To));
  if (payload.Cc) out.push(...splitAddressList(payload.Cc));
  if (parsed?.recipients) out.push(...parsed.recipients);
  return out;
}

function splitAddressList(list: string): string[] {
  // Display names may contain commas inside quotes; split only outside them.
  const parts: string[] = [];
  let cur = "";
  let quoted = false;
  for (const ch of list) {
    if (ch === '"') quoted = !quoted;
    if (ch === "," && !quoted) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}

function header(payload: PostmarkInbound, name: string): string | undefined {
  const lower = name.toLowerCase();
  return payload.Headers?.find((h) => h.Name?.toLowerCase() === lower)?.Value;
}

/**
 * Turn a Postmark inbound POST into the pipeline's message shape.
 * Prefers the raw message so the result is byte-for-byte what Gmail would
 * have produced; falls back to Postmark's pre-parsed fields.
 */
export async function parsePostmarkInbound(payload: PostmarkInbound): Promise<ParsedMessage> {
  const fallbackMessageId = payload.MessageID?.trim() || `postmark-${Date.now()}`;

  if (payload.RawEmail && payload.RawEmail.trim()) {
    return parseRawMessage(payload.RawEmail, { fallbackMessageId });
  }

  // mailparser renders a sender as "Name" <address> (always quoted); match it
  // so a message arriving either way hashes and displays the same.
  const name = (payload.FromFull?.Name || payload.FromName || "").replace(/"/g, "");
  const address = payload.FromFull?.Email || payload.From || "";
  const from = name && address ? `"${name}" <${address}>` : address || name;

  let icsContent: string | undefined;
  for (const att of payload.Attachments ?? []) {
    const isIcs =
      att.ContentType?.toLowerCase().includes("calendar") || att.Name?.toLowerCase().endsWith(".ics");
    if (isIcs && att.Content) {
      icsContent = Buffer.from(att.Content, "base64").toString("utf8");
      break;
    }
  }

  const rfcMessageId = header(payload, "Message-ID")?.replace(/[<>]/g, "").trim();
  const date = payload.Date ? new Date(payload.Date) : new Date();

  return {
    messageId: rfcMessageId || fallbackMessageId,
    threadId: "",
    gmailId: "",
    from,
    subject: payload.Subject ?? "",
    receivedAt: Number.isNaN(date.getTime()) ? new Date() : date,
    bodyText: payload.TextBody ?? "",
    bodyHtml: payload.HtmlBody ?? "",
    hasIcs: !!icsContent,
    icsContent,
    listUnsubscribe: header(payload, "List-Unsubscribe") !== undefined,
    recipients: [],
  };
}

/**
 * A message a person forwarded by hand ("Fwd: …") carries the sender's own
 * address in From and the original inside the body. Detection and the
 * sender-history rule key on the original sender, so unwrap the Gmail-style
 * forwarded block when it is there. A filter-based auto-forward keeps the
 * original headers and passes through untouched.
 */
const FWD_BLOCK =
  /-{3,}\s*Forwarded message\s*-{3,}\s*\n(?:\s*(?:From|Date|Subject|To|Cc):[^\n]*\n)+/i;

export function unwrapForwarded(msg: ParsedMessage): ParsedMessage {
  if (!/^\s*(fwd?|fw|tr|wg)\s*:/i.test(msg.subject)) return msg;
  const m = FWD_BLOCK.exec(msg.bodyText);
  if (!m) return msg;
  const block = m[0];
  const field = (k: string) => new RegExp(`^\\s*${k}:\\s*(.+)$`, "im").exec(block)?.[1]?.trim();
  const from = field("From");
  const subject = field("Subject");
  if (!from) return msg;
  return {
    ...msg,
    from,
    subject: subject || msg.subject.replace(/^\s*(fwd?|fw|tr|wg)\s*:\s*/i, ""),
    bodyText: msg.bodyText.slice(m.index + block.length).trimStart(),
  };
}

/**
 * Gmail will not auto-forward to an address until its owner confirms. The
 * confirmation mail lands here like everything else; its code and link are
 * surfaced in Settings so the user can finish the setup without Lumi ever
 * holding their inbox.
 */
export type ForwardingConfirmation = { code: string | null; link: string | null; forwarder: string | null };

export function parseGmailForwardingConfirmation(
  msg: Pick<ParsedMessage, "from" | "subject" | "bodyText">
): ForwardingConfirmation | null {
  const fromGoogle = /forwarding-noreply@google\.com/i.test(msg.from);
  const looksLikeIt = /gmail forwarding confirmation/i.test(msg.subject);
  if (!fromGoogle && !looksLikeIt) return null;
  const code =
    /confirmation code:\s*(\d{6,})/i.exec(msg.bodyText)?.[1] ??
    /\(#(\d{6,})\)/.exec(msg.subject)?.[1] ??
    null;
  const link = /https:\/\/mail-settings\.google\.com\/mail\/vf-[^\s<>"']+/i.exec(msg.bodyText)?.[0] ?? null;
  const forwarder =
    /receive mail from\s+([^\s<>"']+@[^\s<>"']+)/i.exec(msg.subject)?.[1] ??
    /^\s*([^\s<>"']+@[^\s<>"']+)\s+has requested/im.exec(msg.bodyText)?.[1] ??
    null;
  return { code, link, forwarder };
}
