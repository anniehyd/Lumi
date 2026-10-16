import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildCalendar } from "@/lib/ics";
import { resolveFeedUser } from "@/lib/feedToken";
import type { MockEvent } from "@/lib/mock/events";

export const dynamic = "force-dynamic";

/**
 * iCalendar subscription feed (Apple Calendar → Add Subscription Calendar).
 *
 * Calendar clients can't sign in, so the URL carries a per-user secret:
 *   https://<host>/api/calendar.ics?token=<user's feed token>
 * Settings mints the token (GET /api/calendar-feed) and can rotate it. The
 * legacy deployment-wide CALENDAR_FEED_TOKEN is still accepted for existing
 * single-user installs — see resolveFeedUser.
 *
 * Serves the owner's accepted and maybe events, nobody else's.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const userId = await resolveFeedUser(token);
  if (!userId) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const rows = await prisma.event.findMany({
    where: { userId, status: { in: ["ACCEPTED", "MAYBE"] } },
    orderBy: { startTime: "asc" },
  });

  const events: MockEvent[] = rows.map((e) => ({
    id: e.id,
    status: e.status as MockEvent["status"],
    confidence: e.confidence,
    detectedVia: e.detectedVia as MockEvent["detectedVia"],
    kind: "MEETING",
    title: e.title,
    description: e.description ?? "",
    startTime: e.startTime.toISOString(),
    endTime: e.endTime?.toISOString(),
    timezone: e.timezone,
    locationName: e.locationName ?? undefined,
    locationAddress: e.locationAddress ?? undefined,
    organizerName: e.organizerName ?? undefined,
    organizerCompany: e.organizerCompany ?? undefined,
    rsvpLink: e.rsvpLink ?? undefined,
    sourceEmailId: e.emailId ?? "",
  }));

  return new NextResponse(buildCalendar(events, "Lumi"), {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="lumi.ics"',
      "Cache-Control": "private, max-age=300",
    },
  });
}
