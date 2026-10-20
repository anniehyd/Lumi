import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { normalizeProfile, type UserProfile } from "@/lib/profile";

export const dynamic = "force-dynamic";

/**
 * The user's interest profile and whether they have finished onboarding.
 * The onboarding gate polls this once per session, so it stays cheap.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { profile: true, onboardedAt: true, handshakeFeedUrl: true },
  });
  if (!user) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({
    onboarded: Boolean(user.onboardedAt),
    profile: user.profile ? normalizeProfile(user.profile) : null,
    handshakeFeedUrl: user.handshakeFeedUrl,
  });
}

/**
 * Save the profile. Passing `complete: true` stamps onboardedAt, which is what
 * makes the onboarding flow show exactly once — Settings edits the same profile
 * without it, so re-saving later never re-triggers the flow.
 */
export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    profile?: unknown;
    handshakeFeedUrl?: string | null;
    complete?: boolean;
  };

  const profile: UserProfile = normalizeProfile(body.profile);

  const feed =
    typeof body.handshakeFeedUrl === "string" && body.handshakeFeedUrl.trim()
      ? body.handshakeFeedUrl.trim()
      : body.handshakeFeedUrl === null
        ? null
        : undefined;

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      profile,
      ...(feed !== undefined ? { handshakeFeedUrl: feed } : {}),
      // Never un-stamp: once onboarded, always onboarded.
      ...(body.complete ? { onboardedAt: new Date() } : {}),
    },
    select: { profile: true, onboardedAt: true, handshakeFeedUrl: true },
  });

  return NextResponse.json({
    onboarded: Boolean(user.onboardedAt),
    profile: normalizeProfile(user.profile),
    handshakeFeedUrl: user.handshakeFeedUrl,
  });
}
