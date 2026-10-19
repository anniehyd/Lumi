import { NextResponse } from "next/server";
import { getViewer } from "@/lib/apiAuth";
import { validatePollInput } from "@/lib/meet";
import { meetStore } from "@/lib/meetStore";

export const dynamic = "force-dynamic";

/** Create a poll. The signed-in user owns it; in demo mode nobody does. */
export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const error = validatePollInput(body);
  if (error) return NextResponse.json({ error }, { status: 400 });

  const poll = await meetStore().create({
    title: String(body.title).trim(),
    days: [...new Set(body.days as string[])].sort(),
    dayStart: Number(body.dayStart),
    dayEnd: Number(body.dayEnd),
    slotMinutes: Number(body.slotMinutes ?? 30),
    timezone: String(body.timezone),
    ownerId: viewer.userId,
  });
  return NextResponse.json({ slug: poll.slug }, { status: 201 });
}

/** The viewer's polls, newest first. Demo mode lists the sample poll. */
export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const polls = viewer.userId
    ? await meetStore().listForOwner(viewer.userId)
    : viewer.demo
      ? await meetStore().listForOwner("")
      : [];
  return NextResponse.json({ polls });
}
