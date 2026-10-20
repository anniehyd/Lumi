import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, hasGoogleAccount } from "@/lib/auth";
import { syncEventToCalendar, unsyncEvent } from "@/lib/services/calendar";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { id } = await params;
  // A user who only forwards mail has no Google Calendar to write to. That is
  // not a failure: their calendar is the iCal subscription feed, which already
  // carries every accepted event.
  if (!(await hasGoogleAccount(session.user.id))) {
    return NextResponse.json({
      synced: false,
      reason: "no_google_calendar",
      useFeed: true,
      feedSettingsUrl: "/settings#calendar-feed",
    });
  }
  const result = await syncEventToCalendar(session.user.id, id);
  if (!result) {
    return NextResponse.json(
      { error: "sync failed — check Google connection" },
      { status: 400 }
    );
  }
  return NextResponse.json({ synced: true, ...result });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { id } = await params;
  const ok = await unsyncEvent(session.user.id, id);
  return NextResponse.json({ ok });
}
