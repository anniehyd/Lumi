import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";

/**
 * Per-user forwarding addresses: lumi+<token>@INBOUND_EMAIL_DOMAIN.
 *
 * A user who will not (or cannot — the Google OAuth app is unverified) grant
 * Gmail access instead forwards mail to this address. The inbound provider
 * (Postmark; see src/lib/services/inbound.ts) posts each message to
 * POST /api/ingest/inbound, and the token in the local part says which user
 * the mail belongs to. Like calendarFeedToken, the token is the credential:
 * it is minted the first time the user asks for the address and can be
 * rotated from Settings, which makes mail sent to the old address bounce.
 *
 * 32 hex characters (128 bits) rather than the feed's 48 keeps the address
 * short enough to read back and comfortably inside the 64-character local
 * part limit; it is still far beyond guessable.
 */

const TOKEN_BYTES = 16;
const TOKEN_RE = /^[a-f0-9]{32}$/;
export const ALIAS_LOCAL_PART = "lumi";

export function mintForwardingToken(): string {
  return randomBytes(TOKEN_BYTES).toString("hex");
}

/** The domain inbound mail is accepted on, or null when forwarding is not set up. */
export function inboundDomain(): string | null {
  const d = process.env.INBOUND_EMAIL_DOMAIN?.trim().toLowerCase().replace(/^@/, "");
  return d || null;
}

/** The user's forwarding token, creating one if they have none yet. */
export async function getOrCreateForwardingToken(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { forwardingToken: true },
  });
  if (user?.forwardingToken) return user.forwardingToken;
  const token = mintForwardingToken();
  await prisma.user.update({ where: { id: userId }, data: { forwardingToken: token } });
  return token;
}

/** Replace the user's token. Mail to the old address is dropped from then on. */
export async function rotateForwardingToken(userId: string): Promise<string> {
  const token = mintForwardingToken();
  await prisma.user.update({ where: { id: userId }, data: { forwardingToken: token } });
  return token;
}

/** The full address for a token, e.g. lumi+3f…@inbound.example.edu. */
export function forwardingAddress(token: string, domain: string): string {
  return `${ALIAS_LOCAL_PART}+${token}@${domain}`;
}

/**
 * The token inside one recipient address, or null.
 *
 * Accepts the bare address or a display-name form ("Lumi <lumi+abc@…>"),
 * any letter case, and — when a domain is given — only that domain, so a
 * message that merely mentions a Lumi-looking address elsewhere cannot be
 * routed by it. Without a domain (not configured) the domain is not checked.
 */
export function parseAliasToken(address: string, domain: string | null = inboundDomain()): string | null {
  const m = /<([^<>]+)>\s*$/.exec(address.trim());
  const bare = (m ? m[1] : address).trim().toLowerCase();
  const at = bare.lastIndexOf("@");
  if (at < 0) return null;
  const local = bare.slice(0, at);
  const host = bare.slice(at + 1);
  if (domain && host !== domain) return null;
  const plus = local.indexOf("+");
  if (plus < 0 || local.slice(0, plus) !== ALIAS_LOCAL_PART) return null;
  const token = local.slice(plus + 1);
  return TOKEN_RE.test(token) ? token : null;
}

/** Which user a presented forwarding token belongs to, or null. */
export async function resolveForwardingUser(token: string): Promise<string | null> {
  if (!TOKEN_RE.test(token)) return null;
  const user = await prisma.user.findUnique({
    where: { forwardingToken: token },
    select: { id: true },
  });
  return user?.id ?? null;
}

/**
 * The first of several candidate recipient addresses that names a known user.
 * Inbound payloads carry the recipient in more than one place (the envelope,
 * To, Delivered-To); the first match wins and unknown tokens are ignored.
 */
export async function resolveForwardingUserFromAddresses(
  addresses: string[],
  domain: string | null = inboundDomain()
): Promise<{ userId: string; token: string } | null> {
  const seen = new Set<string>();
  for (const address of addresses) {
    const token = parseAliasToken(address, domain);
    if (!token || seen.has(token)) continue;
    seen.add(token);
    const userId = await resolveForwardingUser(token);
    if (userId) return { userId, token };
  }
  return null;
}
