import { NextResponse } from "next/server";
import { getViewer } from "@/lib/apiAuth";
import { hasGoogleAccount } from "@/lib/auth";
import { getEvent, updateEvent } from "@/lib/dataSource";
import { decisionDelta, recordMetrics } from "@/lib/metrics";
import { syncEventToCalendar, unsyncEvent } from "@/lib/services/calendar";
import type { MockEvent } from "@/lib/mock/events";

export const dynamic = "force-dynamic";

const validStatuses: MockEvent["status"][] = [
  "PENDING",
  "ACCEPTED",
  "MAYBE",
  "DECLINED",
];

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { id } = await params;
  const event = await getEvent(viewer, id);
  if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ event });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const status = body.status as MockEvent["status"] | undefined;

  if (status && !validStatuses.includes(status)) {
    return NextResponse.json(
      { error: "status must be one of " + validStatuses.join(", ") },
      { status: 400 }
    );
  }

  const title =
    typeof body.title === "string" && body.title.trim()
      ? body.title.trim()
      : undefined;
  const locationName =
    typeof body.locationName === "string" ? body.locationName.trim() || null : undefined;
  const locationAddress =
    typeof body.locationAddress === "string"
      ? body.locationAddress.trim() || null
      : undefined;
  const description =
    typeof body.description === "string" ? body.description.trim() : undefined;
  const REASONS = ["not_interested", "not_an_event", "bad_time"];
  const reason = typeof body.reason === "string" && REASONS.includes(body.reason) ? body.reason : undefined;
  // A reason only makes sense with a skip; any other decision clears it.
  const declineReason = status === "DECLINED" ? (reason ?? null) : status ? null : undefined;

  const updated = await updateEvent(viewer, id, {
    status,
    title,
    locationName,
    locationAddress,
    description,
    declineReason,
  });
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { event, previousStatus } = updated;

  // Deciding a card drives the calendar: Attend writes the event to Google
  // Calendar, walking it back removes it. Calendar failures are isolated —
  // the status change above always sticks. Only a real change of status does
  // any of this; re-sending the same status is a no-op.
  // "feed" means the user has no Google Calendar (they forward mail instead
  // of signing in with Gmail); the accepted event reaches them through their
  // iCal subscription, so nothing is written and nothing has failed.
  let calendar: "synced" | "removed" | "skipped" | "failed" | "feed" = "skipped";
  const userId = viewer.demo ? null : viewer.userId;
  if (status && status !== previousStatus && userId) {
    await recordMetrics(userId, decisionDelta(previousStatus, status));
    try {
      if (status === "ACCEPTED") {
        if (await syncEventToCalendar(userId, id)) calendar = "synced";
        else calendar = (await hasGoogleAccount(userId)) ? "failed" : "feed";
      } else if (previousStatus === "ACCEPTED") {
        calendar = (await unsyncEvent(userId, id)) ? "removed" : "skipped";
      }
    } catch (err) {
      console.error("[calendar] auto-sync failed:", err);
      calendar = "failed";
    }
  }

  return NextResponse.json({ event, calendar });
}
