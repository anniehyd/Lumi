import { randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";

/**
 * Per-user secrets for the iCal subscription feed.
 *
 * Calendar apps cannot sign in, so the feed URL carries a token and the token
 * is the credential. Each user gets their own; it is minted the first time
 * they ask for the feed URL and can be rotated from Settings, which cuts off
 * anyone who had the old link.
 *
 * Before this, one deployment-wide CALENDAR_FEED_TOKEN served one user chosen
 * by CALENDAR_FEED_EMAIL. That path still works for existing single-user
 * installs; see resolveFeedUser.
 */

const TOKEN_BYTES = 24; // 48 hex chars; 192 bits is plenty for a bearer secret
const TOKEN_RE = /^[a-f0-9]{48}$/;

export function mintFeedToken(): string {
  return randomBytes(TOKEN_BYTES).toString("hex");
}

/** The user's feed token, creating one if they have none yet. */
export async function getOrCreateFeedToken(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { calendarFeedToken: true },
  });
  if (user?.calendarFeedToken) return user.calendarFeedToken;
  const token = mintFeedToken();
  await prisma.user.update({ where: { id: userId }, data: { calendarFeedToken: token } });
  return token;
}

/** Replace the user's token. Old subscription links stop working at once. */
export async function rotateFeedToken(userId: string): Promise<string> {
  const token = mintFeedToken();
  await prisma.user.update({ where: { id: userId }, data: { calendarFeedToken: token } });
  return token;
}

function constantTimeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Which user a presented feed token belongs to, or null.
 *
 * Per-user tokens are looked up by their unique column. The legacy
 * deployment-wide token (CALENDAR_FEED_TOKEN + CALENDAR_FEED_EMAIL) is
 * honoured so an existing Apple Calendar subscription keeps refreshing after
 * an upgrade; it resolves to the configured email, or to the sole user when
 * the database has exactly one.
 */
export async function resolveFeedUser(token: string): Promise<string | null> {
  if (!token) return null;

  if (TOKEN_RE.test(token)) {
    const user = await prisma.user.findUnique({
      where: { calendarFeedToken: token },
      select: { id: true },
    });
    if (user) return user.id;
  }

  const legacy = process.env.CALENDAR_FEED_TOKEN;
  if (legacy && constantTimeEqual(token, legacy)) {
    const email = process.env.CALENDAR_FEED_EMAIL?.trim();
    if (email) {
      const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      return user?.id ?? null;
    }
    const users = await prisma.user.findMany({ take: 2, select: { id: true } });
    return users.length === 1 ? users[0].id : null;
  }

  return null;
}

/** Absolute feed URLs for a token, in https and webcal form. */
export function feedUrls(origin: string, token: string): { https: string; webcal: string } {
  const https = `${origin}/api/calendar.ics?token=${token}`;
  return { https, webcal: https.replace(/^https?/, "webcal") };
}
