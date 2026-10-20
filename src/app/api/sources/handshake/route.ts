import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  normalizeFeedUrl,
  fetchHandshakeEvents,
  HandshakeFeedError,
} from "@/lib/services/handshake";
import { ingestHandshake } from "@/lib/services/ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Current Handshake connection state. The URL carries a private token, so
 *  only whether one is set and where it points is returned, never the URL. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { handshakeFeedUrl: true },
  });
  const url = user?.handshakeFeedUrl || process.env.HANDSHAKE_ICS_URL?.trim();
  return NextResponse.json({
    connected: !!url,
    host: url ? new URL(url).hostname : null,
    fromEnv: !user?.handshakeFeedUrl && !!process.env.HANDSHAKE_ICS_URL,
  });
}

/**
 * Connect a Handshake calendar feed.
 * The feed is fetched once before it is stored, so a bad paste fails here with
 * a readable message rather than silently doing nothing every sweep.
 */
export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  if (typeof body.feedUrl !== "string") {
    return NextResponse.json({ error: "feedUrl is required" }, { status: 400 });
  }

  let normalized: string;
  try {
    normalized = normalizeFeedUrl(body.feedUrl);
    await fetchHandshakeEvents(normalized);
  } catch (err) {
    if (err instanceof HandshakeFeedError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { handshakeFeedUrl: normalized },
  });

  // Pull straight away so connecting produces visible events, not a wait
  // until the next sweep.
  const result = await ingestHandshake(session.user.id);
  return NextResponse.json({ connected: true, ...result });
}

/** Disconnect. Already-ingested events stay; they age out with everything else. */
export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  await prisma.user.update({
    where: { id: session.user.id },
    data: { handshakeFeedUrl: null },
  });
  return NextResponse.json({ connected: false });
}
