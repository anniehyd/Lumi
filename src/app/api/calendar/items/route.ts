import { NextResponse } from "next/server";
import { getViewer } from "@/lib/apiAuth";
import { categorizeTitle, demoGoogleCalendar, type CalendarItem } from "@/lib/calendarItems";
import { listCalendarWindow } from "@/lib/services/calendar";

export const dynamic = "force-dynamic";

/**
 * The user's own Google Calendar for the Calendar page: from now through the
 * next six weeks, nothing that already happened. Read-only, and only ever
 * shown to the person it belongs to.
 * Demo mode, or a user without Google, gets a plausible student week.
 */
export async function GET(req: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const requested = Number(new URL(req.url).searchParams.get("days") ?? "42");
  const days = Number.isFinite(requested) ? Math.min(Math.max(Math.trunc(requested), 7), 120) : 42;
  // Only what is still ahead: the calendar is for looking forward.
  const now = new Date();
  const from = now;
  const to = new Date(now.getTime() + days * 86_400_000);

  if (viewer.userId && !viewer.demo) {
    const busy = await listCalendarWindow(viewer.userId, from, to);
    if (busy) {
      const items: CalendarItem[] = busy.map((b, i) => ({
        id: `g-${i}-${b.start.getTime()}`,
        title: b.title,
        start: b.start.toISOString(),
        end: b.end.toISOString(),
        category: categorizeTitle(b.title),
        source: "google",
      }));
      return NextResponse.json({ items, source: "google" });
    }
    // Signed in but no Google grant (forwarding-only users): nothing to show
    // from Google, and no made-up schedule for a real account.
    return NextResponse.json({ items: [], source: "none" });
  }

  const items = demoGoogleCalendar(now).filter((i) => new Date(i.end) > now);
  return NextResponse.json({ items, source: "demo" });
}
