import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ingestUser } from "@/lib/services/ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Manual ingest: pull recent mail, run detection, return counts.
 * Call from Settings ("Scan now") or on first login.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const result = await ingestUser(session.user.id, {
    query: body.query,
    maxResults: body.maxResults,
  });

  return NextResponse.json(result);
}
