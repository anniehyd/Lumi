import { google } from "googleapis";
import { prisma } from "@/lib/db";
import { getGoogleAccessToken } from "@/lib/auth";

export type CalendarBusySlot = { title: string; start: Date; end: Date };

/**
 * List the user's Google Calendar events in [timeMin, timeMax).
 * Returns null when the user has no Google connection (demo mode) or the
 * call fails — callers treat that as "conflicts unknown", never as an error.
 */
export async function listCalendarWindow(
  userId: string,
  timeMin: Date,
  timeMax: Date,
  calendarId: string = "primary"
): Promise<CalendarBusySlot[] | null> {
  try {
    const token = await getGoogleAccessToken(userId);
    if (!token) return null;
    const oauth2 = new google.auth.OAuth2();
    oauth2.setCredentials({ access_token: token });
    const cal = google.calendar({ version: "v3", auth: oauth2 });
    const res = await cal.events.list({
      calendarId,
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 2500,
    });
    return (res.data.items ?? [])
      .filter((i) => i.status !== "cancelled" && (i.start?.dateTime || i.start?.date))
      .map((i) => ({
        title: i.summary ?? "(untitled)",
        start: new Date(i.start!.dateTime ?? i.start!.date!),
        end: new Date(i.end?.dateTime ?? i.end?.date ?? i.start!.dateTime ?? i.start!.date!),
      }));
  } catch (err) {
    console.error("[calendar] listCalendarWindow failed:", err);
    return null;
  }
}

/** First busy slot overlapping [start, end), or null. Pure — no I/O. */
export function findConflict(
  busy: CalendarBusySlot[],
  start: Date,
  end: Date
): string | null {
  const hit = busy.find((b) => b.start < end && b.end > start);
  return hit ? hit.title : null;
}

/**
 * Write an accepted Lumi event to the user's Google Calendar.
 * Records the calendarEventId back on the row and flags conflicts.
 */
export async function syncEventToCalendar(
  userId: string,
  eventId: string,
  calendarId: string = "primary"
): Promise<{
  calendarEventId: string;
  conflicts: string[];
} | null> {
  const token = await getGoogleAccessToken(userId);
  if (!token) return null;

  const event = await prisma.event.findFirst({
    where: { id: eventId, userId },
  });
  if (!event) return null;

  const oauth2 = new google.auth.OAuth2();
  oauth2.setCredentials({ access_token: token });
  const cal = google.calendar({ version: "v3", auth: oauth2 });

  const start = event.startTime;
  const end = event.endTime ?? new Date(start.getTime() + 60 * 60 * 1000);

  // Conflict check — events overlapping our window.
  const conflictRes = await cal.events.list({
    calendarId,
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
  });
  const conflictIds = (conflictRes.data.items ?? [])
    .filter((i) => i.id && i.status !== "cancelled")
    .map((i) => i.id!);

  // Insert event.
  const description = [
    event.description,
    event.rsvpLink ? `\nRSVP: ${event.rsvpLink}` : "",
    "\n\n— Added by Lumi",
  ]
    .filter(Boolean)
    .join("");

  const location = [event.locationName, event.locationAddress]
    .filter(Boolean)
    .join(", ");

  const res = await cal.events.insert({
    calendarId,
    requestBody: {
      summary: event.title,
      description,
      location: location || undefined,
      start: {
        dateTime: start.toISOString(),
        timeZone: event.timezone,
      },
      end: {
        dateTime: end.toISOString(),
        timeZone: event.timezone,
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: "popup", minutes: 60 },
          { method: "popup", minutes: 15 },
        ],
      },
    },
  });

  const calendarEventId = res.data.id!;
  await prisma.event.update({
    where: { id: event.id },
    data: {
      calendarEventId,
      conflictIds,
      status: "ACCEPTED",
    },
  });

  return { calendarEventId, conflicts: conflictIds };
}

export async function unsyncEvent(
  userId: string,
  eventId: string,
  calendarId: string = "primary"
): Promise<boolean> {
  const token = await getGoogleAccessToken(userId);
  if (!token) return false;

  const event = await prisma.event.findFirst({
    where: { id: eventId, userId },
  });
  if (!event?.calendarEventId) return false;

  const oauth2 = new google.auth.OAuth2();
  oauth2.setCredentials({ access_token: token });
  const cal = google.calendar({ version: "v3", auth: oauth2 });

  try {
    await cal.events.delete({ calendarId, eventId: event.calendarEventId });
  } catch {
    // Event may have been deleted manually — still clear our pointer.
  }

  await prisma.event.update({
    where: { id: event.id },
    data: { calendarEventId: null, conflictIds: [] },
  });
  return true;
}
