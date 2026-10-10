import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * "Lumi missed something." Accept/decline on an Event measures precision; this
 * is the only recall signal the product has, and recall is the thing Lumi
 * actually promises.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { note } = (await req.json().catch(() => ({}))) as { note?: string };
  const text = typeof note === "string" ? note.trim().slice(0, 2000) : "";
  if (!text) return NextResponse.json({ error: "note required" }, { status: 400 });

  await prisma.miss.create({ data: { userId, note: text } });
  return NextResponse.json({ ok: true });
}

/** Weekly read: how many misses each user reported, newest first. */
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const misses = await prisma.miss.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, note: true, createdAt: true },
  });
  return NextResponse.json({ misses });
}
