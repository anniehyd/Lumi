import { timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildCalendar } from "@/lib/ics";
import type { MockEvent } from "@/lib/mock/events";

export const dynamic = "force-dynamic";

/**
 * iCalendar subscription feed (Apple Calendar → Add Subscription Calendar).
 * Calendar clients can't sign in, so access requires a secret token:
 *   https://<host>/api/calendar.ics?token=<CALENDAR_FEED_TOKEN>
 * Serves the user matching CALENDAR_FEED_EMAIL, or the sole user in the DB.
 */

function tokenMatches(given: string, secret: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  const secret = process.env.CALENDAR_FEED_TOKEN;
  if (!secret) {
    return new NextResponse("Feed disabled: CALENDAR_FEED_TOKEN not set", { status: 503 });
  }
  const token = req.nextUrl.searchParams.get("token") ?? "";
  if (!tokenMatches(token, secret)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const email = process.env.CALENDAR_FEED_EMAIL;
  let userId: string | null = null;
  if (email) {
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    userId = user?.id ?? null;
  } else {
    const users = await prisma.user.findMany({ take: 2, select: { id: true } });
    userId = users.length === 1 ? users[0].id : null;
  }
  if (!userId) {
    return new NextResponse("No feed user (set CALENDAR_FEED_EMAIL)", { status: 404 });
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
