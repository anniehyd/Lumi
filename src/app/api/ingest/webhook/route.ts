import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ingestUser } from "@/lib/services/ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Google Cloud Pub/Sub push handler for Gmail watch notifications.
 * Expected body: { message: { data: base64(JSON({emailAddress, historyId})), ... } }
 *
 * We verify a shared secret passed as ?token=<GMAIL_WEBHOOK_SECRET>,
 * which you configure when creating the Pub/Sub push subscription.
 */
export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const expected = process.env.GMAIL_WEBHOOK_SECRET;
  if (!expected || searchParams.get("token") !== expected) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null as null | { message?: { data?: string } });
  const encoded = body?.message?.data;
  if (!encoded) return NextResponse.json({ ok: true, skipped: "no-data" });

  const decoded = JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as {
    emailAddress: string;
    historyId: string;
  };

  const user = await prisma.user.findUnique({
    where: { email: decoded.emailAddress },
  });
  if (!user) return NextResponse.json({ ok: true, skipped: "unknown-user" });

  // For simplicity we re-poll recent mail; production could diff the history
  // delta and fetch only changed messages.
  const result = await ingestUser(user.id, { query: "newer_than:1d", maxResults: 25 });
  return NextResponse.json({ ok: true, ...result });
}
