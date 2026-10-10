import { prisma } from "@/lib/db";
import { mockEvents, mockEmails } from "@/lib/mock/events";
import type { MockEvent, MockEmail } from "@/lib/mock/events";
import type { Viewer } from "@/lib/apiAuth";

/**
 * Data access for the UI routes, scoped to one viewer.
 *
 * Every function takes the Viewer resolved by getViewer(). A signed-in user
 * only ever sees and changes their own rows. Mock data is served in demo mode
 * only — a real account with an empty inbox gets an empty list, never the
 * sample events.
 *
 * Toggle the demo fallback off entirely with LUMI_USE_MOCK_FALLBACK=false.
 */

const useMockFallback = process.env.LUMI_USE_MOCK_FALLBACK !== "false";

/** Mocks stand in for the database only when nobody real is signed in. */
function mocksAllowed(viewer: Viewer): boolean {
  return viewer.demo && useMockFallback;
}

function dbEventToMock(e: {
  id: string;
  status: string;
  confidence: number;
  detectedVia: string;
  title: string;
  description: string | null;
  startTime: Date;
  endTime: Date | null;
  timezone: string;
  locationName: string | null;
  locationAddress: string | null;
  organizerName: string | null;
  organizerCompany: string | null;
  rsvpLink: string | null;
  emailId: string | null;
  relevance: number;
  conflictTitle: string | null;
}): MockEvent {
  const kind = inferKind(e.title, e.description ?? "");
  return {
    id: e.id,
    status: e.status as MockEvent["status"],
    confidence: e.confidence,
    detectedVia: e.detectedVia as MockEvent["detectedVia"],
    kind,
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
    relevance: e.relevance,
    conflictTitle: e.conflictTitle ?? undefined,
  };
}

function inferKind(title: string, desc: string): MockEvent["kind"] {
  const t = (title + " " + desc).toLowerCase();
  if (t.includes("deadline") || t.includes("application")) return "DEADLINE";
  if (t.includes("coffee") || t.includes("chat")) return "COFFEE_CHAT";
  if (t.includes("info session") || t.includes("intro to")) return "INFO_SESSION";
  return "MEETING";
}

export async function listEvents(
  viewer: Viewer,
  opts: { status?: MockEvent["status"]; limit?: number } = {}
): Promise<MockEvent[]> {
  if (!viewer.userId) return mocksAllowed(viewer) ? filterMock(opts) : [];
  try {
    const rows = await prisma.event.findMany({
      where: {
        userId: viewer.userId,
        ...(opts.status ? { status: opts.status } : {}),
      },
      orderBy: { startTime: "asc" },
      take: opts.limit,
    });
    if (rows.length === 0 && mocksAllowed(viewer)) return filterMock(opts);
    return rows.map(dbEventToMock);
  } catch (err) {
    if (mocksAllowed(viewer)) return filterMock(opts);
    throw err;
  }
}

function filterMock(opts: { status?: MockEvent["status"]; limit?: number }): MockEvent[] {
  let arr = mockEvents;
  if (opts.status) arr = arr.filter((e) => e.status === opts.status);
  arr = [...arr].sort((a, b) => a.startTime.localeCompare(b.startTime));
  if (opts.limit) arr = arr.slice(0, opts.limit);
  return arr;
}

export async function getEvent(viewer: Viewer, id: string): Promise<MockEvent | null> {
  if (viewer.userId) {
    try {
      const row = await prisma.event.findFirst({ where: { id, userId: viewer.userId } });
      if (row) return dbEventToMock(row);
    } catch (err) {
      if (!mocksAllowed(viewer)) throw err;
    }
  }
  return mocksAllowed(viewer) ? (mockEvents.find((e) => e.id === id) ?? null) : null;
}

export type EventUpdates = {
  status?: MockEvent["status"];
  title?: string;
  locationName?: string | null;
  locationAddress?: string | null;
  description?: string;
};

/**
 * Apply edits to one of the viewer's events. Returns the event plus the status
 * it had before, so the caller can tell a real decision from a no-op.
 */
export async function updateEvent(
  viewer: Viewer,
  id: string,
  updates: EventUpdates
): Promise<{ event: MockEvent; previousStatus: MockEvent["status"] } | null> {
  if (viewer.userId) {
    try {
      const current = await prisma.event.findFirst({
        where: { id, userId: viewer.userId },
        select: { status: true },
      });
      if (current) {
        const row = await prisma.event.update({
          where: { id },
          data: {
            ...(updates.status ? { status: updates.status } : {}),
            ...(updates.title ? { title: updates.title } : {}),
            ...(updates.locationName !== undefined ? { locationName: updates.locationName } : {}),
            ...(updates.locationAddress !== undefined
              ? { locationAddress: updates.locationAddress }
              : {}),
            ...(updates.description !== undefined ? { description: updates.description } : {}),
          },
        });
        return {
          event: dbEventToMock(row),
          previousStatus: current.status as MockEvent["status"],
        };
      }
    } catch (err) {
      if (!mocksAllowed(viewer)) throw err;
    }
  }
  if (!mocksAllowed(viewer)) return null;

  // Demo mode: mutate in memory so UI round-trips feel real.
  const found = mockEvents.find((e) => e.id === id);
  if (!found) return null;
  const previousStatus = found.status;
  if (updates.status) found.status = updates.status;
  if (updates.title) found.title = updates.title;
  if (updates.locationName !== undefined) found.locationName = updates.locationName ?? undefined;
  if (updates.locationAddress !== undefined) {
    found.locationAddress = updates.locationAddress ?? undefined;
  }
  if (updates.description !== undefined) found.description = updates.description;
  return { event: found, previousStatus };
}

export async function getEmail(viewer: Viewer, id: string): Promise<MockEmail | null> {
  if (viewer.userId) {
    try {
      const row = await prisma.email.findFirst({ where: { id, userId: viewer.userId } });
      if (row) {
        return {
          id: row.id,
          from: row.from,
          fromName: row.from.split("<")[0].trim() || row.from,
          subject: row.subject,
          receivedAt: row.receivedAt.toISOString(),
          preview: (row.bodyText ?? "").slice(0, 200),
          bodyText: row.bodyText ?? "",
          extractedEventIds: [],
          ignoredSnippets: [],
        };
      }
    } catch (err) {
      if (!mocksAllowed(viewer)) throw err;
    }
  }
  return mocksAllowed(viewer) ? (mockEmails.find((e) => e.id === id) ?? null) : null;
}

export async function getSyncStatus(viewer: Viewer): Promise<{
  dbConnected: boolean;
  eventCount: number;
  pendingCount: number;
  lastIngest: string | null;
  source: "db" | "mock";
}> {
  try {
    const userId = viewer.userId;
    if (!userId) throw new Error("no user");
    const [eventCount, pendingCount, lastEmail] = await Promise.all([
      prisma.event.count({ where: { userId } }),
      prisma.event.count({ where: { userId, status: "PENDING" } }),
      prisma.email.findFirst({
        where: { userId },
        orderBy: { receivedAt: "desc" },
        select: { receivedAt: true },
      }),
    ]);
    return {
      dbConnected: true,
      eventCount,
      pendingCount,
      lastIngest: lastEmail?.receivedAt.toISOString() ?? null,
      source: "db",
    };
  } catch {
    if (!mocksAllowed(viewer)) {
      return { dbConnected: false, eventCount: 0, pendingCount: 0, lastIngest: null, source: "db" };
    }
    return {
      dbConnected: false,
      eventCount: mockEvents.length,
      pendingCount: mockEvents.filter((e) => e.status === "PENDING").length,
      lastIngest: mockEmails[0]?.receivedAt ?? null,
      source: "mock",
    };
  }
}
