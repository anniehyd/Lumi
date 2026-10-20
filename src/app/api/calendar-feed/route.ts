import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { feedUrls, getOrCreateFeedToken, rotateFeedToken } from "@/lib/feedToken";

export const dynamic = "force-dynamic";

/**
 * The signed-in user's iCal subscription link.
 *
 * GET mints a token on first use and returns the URLs; POST rotates it so any
 * calendar app still holding the old link stops receiving events. The token
 * only ever travels inside these URLs — there is no separate "show token".
 */
function originOf(req: Request): string {
  const configured = process.env.NEXTAUTH_URL?.replace(/\/$/, "");
  if (configured) return configured;
  return new URL(req.url).origin;
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const token = await getOrCreateFeedToken(userId);
  return NextResponse.json(feedUrls(originOf(req), token));
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const token = await rotateFeedToken(userId);
  return NextResponse.json({ ...feedUrls(originOf(req), token), rotated: true });
}
