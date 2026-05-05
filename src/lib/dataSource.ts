import { prisma } from "@/lib/db";
import { mockEvents, mockEmails } from "@/lib/mock/events";
import type { MockEvent, MockEmail } from "@/lib/mock/events";

/**
 * Data source with graceful DB → mock fallback.
 * If Postgres isn't reachable (local dev without Docker, no seed run, etc.),
 * we return the in-memory mocks so the UI keeps working.
 * Toggle strict mode via LUMI_USE_MOCK_FALLBACK=false once DB is required.
 */

const useMockFallback = process.env.LUMI_USE_MOCK_FALLBACK !== "false";
const demoUserEmail = "annie@livingbrands.ai";
const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);

async function getDemoUserId(): Promise<string | null> {
  if (!hasDatabaseUrl) return null;
  try {
    const u = await prisma.user.findUnique({
      where: { email: demoUserEmail },
      select: { id: true },
    });
    return u?.id ?? null;
  } catch {
    return null;
  }
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
  };
}

function inferKind(title: string, desc: string): MockEvent["kind"] {
  const t = (title + " " + desc).toLowerCase();
  if (t.includes("deadline") || t.includes("application")) return "DEADLINE";
  if (t.includes("coffee") || t.includes("chat")) return "COFFEE_CHAT";
  if (t.includes("info session") || t.includes("intro to")) return "INFO_SESSION";
  return "MEETING";
}

export async function listEvents(opts: {
  status?: MockEvent["status"];
  limit?: number;
} = {}): Promise<MockEvent[]> {
  try {
    const userId = await getDemoUserId();
    if (!userId) throw new Error("demo user not seeded");
    const rows = await prisma.event.findMany({
      where: {
        userId,
        ...(opts.status ? { status: opts.status } : {}),
      },
      orderBy: { startTime: "asc" },
      take: opts.limit,
    });
    if (rows.length === 0 && useMockFallback) {
      return filterMock(opts);
    }
    return rows.map(dbEventToMock);
  } catch (err) {
    if (useMockFallback) return filterMock(opts);
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

export async function getEvent(id: string): Promise<MockEvent | null> {
  try {
    if (!hasDatabaseUrl) throw new Error("database not configured");
    const row = await prisma.event.findUnique({ where: { id } });
    if (row) return dbEventToMock(row);
  } catch {
    // fall through to mock
  }
  if (useMockFallback) return mockEvents.find((e) => e.id === id) ?? null;
  return null;
}

export async function updateEventStatus(
  id: string,
  status: MockEvent["status"]
): Promise<MockEvent | null> {
  try {
    if (!hasDatabaseUrl) throw new Error("database not configured");
    const row = await prisma.event.update({
      where: { id },
      data: { status },
    });
    return dbEventToMock(row);
  } catch {
    // Mock mode: mutate in memory so UI round-trips feel real.
    const found = mockEvents.find((e) => e.id === id);
    if (found) found.status = status;
    return found ?? null;
  }
}

export async function updateEvent(
  id: string,
  updates: {
    status?: MockEvent["status"];
    title?: string;
    locationName?: string | null;
    locationAddress?: string | null;
    description?: string;
  }
): Promise<MockEvent | null> {
  try {
    if (!hasDatabaseUrl) throw new Error("database not configured");
    const row = await prisma.event.update({
      where: { id },
      data: {
        ...(updates.status ? { status: updates.status } : {}),
        ...(updates.title ? { title: updates.title } : {}),
        ...(updates.locationName !== undefined
          ? { locationName: updates.locationName }
          : {}),
        ...(updates.locationAddress !== undefined
          ? { locationAddress: updates.locationAddress }
          : {}),
        ...(updates.description !== undefined
          ? { description: updates.description }
          : {}),
      },
    });
    return dbEventToMock(row);
  } catch {
    const found = mockEvents.find((e) => e.id === id);
    if (!found) return null;
    if (updates.status) found.status = updates.status;
    if (updates.title) found.title = updates.title;
    if (updates.locationName !== undefined) {
      found.locationName = updates.locationName ?? undefined;
    }
    if (updates.locationAddress !== undefined) {
      found.locationAddress = updates.locationAddress ?? undefined;
    }
    if (updates.description !== undefined) found.description = updates.description;
    return found;
  }
}

export async function getEmail(id: string): Promise<MockEmail | null> {
  try {
    if (!hasDatabaseUrl) throw new Error("database not configured");
    const row = await prisma.email.findUnique({ where: { id } });
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
  } catch {
    // fall through
  }
  if (useMockFallback) return mockEmails.find((e) => e.id === id) ?? null;
  return null;
}

export async function getSyncStatus(): Promise<{
  dbConnected: boolean;
  eventCount: number;
  pendingCount: number;
  lastIngest: string | null;
  source: "db" | "mock";
}> {
  try {
    const userId = await getDemoUserId();
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
    return {
      dbConnected: false,
      eventCount: mockEvents.length,
      pendingCount: mockEvents.filter((e) => e.status === "PENDING").length,
      lastIngest: mockEmails[0]?.receivedAt ?? null,
      source: "mock",
    };
  }
}
