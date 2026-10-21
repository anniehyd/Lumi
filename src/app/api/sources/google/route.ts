import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, googleGrants } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Which optional Google grants the signed-in user has given. Signing in
 * never grants Gmail or Calendar; Settings and onboarding read this to show
 * "Connected" or a Connect button.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  return NextResponse.json(await googleGrants(userId));
}
