import { NextResponse } from "next/server";
import { getViewer } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { keyToDate, parseKey } from "@/lib/meet";
import { meetStore } from "@/lib/meetStore";
import { syncEventToCalendar } from "@/lib/services/calendar";

export const dynamic = "force-dynamic";

/**
 * The owner picks the time. The poll remembers it, and for a signed-in
 * owner it also becomes an accepted Lumi event, written to Google Calendar
 * the same way an accepted card is. Pass `null` to clear the pick.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const found = await meetStore().get(slug);
  if (!found) return NextResponse.json({ error: "not found" }, { status: 404 });
  const isOwner = viewer.demo || (viewer.userId && viewer.userId === found.poll.ownerId);
  if (!isOwner) return NextResponse.json({ error: "Only the person who made this poll can pick the time." }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { start?: unknown; end?: unknown } | null;
  if (!body || body.start === null) {
    const poll = await meetStore().setFinal(slug, null);
    return NextResponse.json({ poll, calendar: "skipped" });
  }

  const start = typeof body.start === "string" ? parseKey(body.start) : null;
  const end = typeof body.end === "string" ? parseKey(body.end) : null;
  if (!start || !end || start.day !== end.day || end.minutes <= start.minutes) {
    return NextResponse.json({ error: "Pick a start and an end on the same day." }, { status: 400 });
  }

  const poll = await meetStore().setFinal(slug, { start: body.start as string, end: body.end as string });
  if (!poll) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Signed-in owners get the time on their calendar through the usual path.
  let calendar: "synced" | "failed" | "skipped" = "skipped";
  if (viewer.userId) {
    const startAt = keyToDate(body.start as string, poll.timezone);
    const endAt = keyToDate(body.end as string, poll.timezone);
    const event = await prisma.event.create({
      data: {
        userId: viewer.userId,
        status: "ACCEPTED",
        confidence: 1,
        detectedVia: "MANUAL",
        source: "MEET",
        title: poll.title,
        description: `Picked from the group poll with ${found.responses.length} answers.`,
        summary: `Looks like ${found.responses.length} of you settled on this time.`,
        date: startAt.toISOString().slice(0, 10),
        startTime: startAt,
        endTime: endAt,
        timezone: poll.timezone,
        relevance: 5,
      },
    });
    try {
      calendar = (await syncEventToCalendar(viewer.userId, event.id)) ? "synced" : "failed";
    } catch (err) {
      console.error("[meet] calendar sync failed:", err);
      calendar = "failed";
    }
  }

  return NextResponse.json({ poll, calendar });
}
