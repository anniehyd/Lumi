import { prisma } from "@/lib/db";
import { listMessages, fetchMessage } from "@/lib/services/gmail";
import { processEmail } from "@/lib/services/detect";

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
  }

  return { fetched: ids.length, newEmails, eventsCreated };
}
