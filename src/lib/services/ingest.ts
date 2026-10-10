import { prisma } from "@/lib/db";
import { listMessages, fetchMessage } from "@/lib/services/gmail";
import { processEmail, persistEvents } from "@/lib/services/detect";
import { fetchHandshakeEvents, HandshakeFeedError } from "@/lib/services/handshake";

/**
 * Ingest recent mail for a user.
 * Per message: dedup by Gmail Message-ID, store, then run detection pipeline.
 * Returns counts so UI can surface progress.
 */
export async function ingestUser(
  userId: string,
  opts: { query?: string; maxResults?: number } = {}
): Promise<{ fetched: number; newEmails: number; eventsCreated: number }> {
  const ids = await listMessages(userId, opts);
  let newEmails = 0;
  let eventsCreated = 0;

  for (const gmailId of ids) {
    const parsed = await fetchMessage(userId, gmailId);
    if (!parsed) continue;

    const existing = await prisma.email.findUnique({
      where: { messageId: parsed.messageId },
    });
    if (existing) continue;

    const email = await prisma.email.create({
      data: {
        userId,
        messageId: parsed.messageId,
        threadId: parsed.threadId || null,
        from: parsed.from,
        subject: parsed.subject,
        bodyText: parsed.bodyText,
        bodyHtml: parsed.bodyHtml,
        receivedAt: parsed.receivedAt,
        hasIcs: parsed.hasIcs,
        processed: false,
      },
    });
    newEmails++;

    // One bad email must not kill the rest of the batch.
    try {
      const n = await processEmail(userId, email.id, {
        bodyText: parsed.bodyText,
        bodyHtml: parsed.bodyHtml,
        icsContent: parsed.icsContent,
        subject: parsed.subject,
        from: parsed.from,
        receivedAt: parsed.receivedAt,
      });
      eventsCreated += n;

      await prisma.email.update({
        where: { id: email.id },
        data: { processed: true },
      });
    } catch (err) {
      console.error(`[ingest] processEmail failed for ${gmailId}:`, err);
    }
  }

  return { fetched: ids.length, newEmails, eventsCreated };
}

/**
 * Resolve the Handshake feed for a user: their stored URL, else the
 * HANDSHAKE_ICS_URL env fallback (single-user deploys like lumi-live).
 */
async function handshakeFeedFor(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { handshakeFeedUrl: true },
  });
  return user?.handshakeFeedUrl || process.env.HANDSHAKE_ICS_URL?.trim() || null;
}

/**
 * Ingest the user's Handshake calendar feed.
 * No-op (not an error) when no feed is configured, so it can be called
 * unconditionally from every sweep.
 */
export async function ingestHandshake(
  userId: string
): Promise<{ configured: boolean; fetched: number; eventsCreated: number }> {
  const feedUrl = await handshakeFeedFor(userId);
  if (!feedUrl) return { configured: false, fetched: 0, eventsCreated: 0 };

  let events;
  try {
    events = await fetchHandshakeEvents(feedUrl);
  } catch (err) {
    // A bad or rotated feed must not take the Gmail sweep down with it.
    if (err instanceof HandshakeFeedError) {
      console.error(`[handshake] ${err.message}`);
    } else {
      console.error("[handshake] feed fetch failed:", err);
    }
    return { configured: true, fetched: 0, eventsCreated: 0 };
  }

  const eventsCreated = await persistEvents(
    userId,
    null,
    events,
    "ICS",
    "HANDSHAKE"
  );
  return { configured: true, fetched: events.length, eventsCreated };
}
