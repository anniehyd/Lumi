import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { loadSummary } from "@/lib/metrics";

export const dynamic = "force-dynamic";

/**
 * The signed-in user's pipeline funnel over the trailing N days (default 7,
 * max 365). Field definitions and the time-saved formula: docs/METRICS.md.
 */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const requested = Number(new URL(req.url).searchParams.get("days") ?? "7");
  const days = Number.isFinite(requested) ? Math.min(Math.max(Math.trunc(requested), 1), 365) : 7;

  return NextResponse.json(await loadSummary(userId, days));
}
