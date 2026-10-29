import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  event: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), count: vi.fn() },
  email: { findFirst: vi.fn(), count: vi.fn() },
  user: { findUnique: vi.fn() },
  account: { findFirst: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ prisma: db }));

import { getEmail, getEvent, getSyncStatus, listEvents, updateEvent } from "@/lib/dataSource";
import { mockEvents } from "@/lib/mock/events";

const row = (over: Record<string, unknown> = {}) => ({
  id: "ev1",
  status: "PENDING",
  confidence: 0.9,
  detectedVia: "LLM",
  title: "Info session",
  description: null,
  startTime: new Date("2099-09-17T22:00:00Z"),
  endTime: null,
  timezone: "America/New_York",
  locationName: null,
  locationAddress: null,
  organizerName: null,
  organizerCompany: null,
  rsvpLink: null,
  emailId: null,
  relevance: 4,
  conflictTitle: null,
  ...over,
});

const alice = { userId: "alice", demo: false };
const demoNoDb = { userId: null, demo: true };

beforeEach(() => {
  vi.resetAllMocks();
});

describe("listEvents", () => {
  it("queries only the viewer's rows", async () => {
    db.event.findMany.mockResolvedValue([row()]);
    const events = await listEvents(alice, { status: "PENDING", limit: 50 });

    expect(db.event.findMany.mock.calls[0][0].where).toEqual({ userId: "alice", status: "PENDING" });
    expect(events).toHaveLength(1);
    expect(events[0].relevance).toBe(4);
  });

  it("gives a real user with no events an empty list, not the sample data", async () => {
    db.event.findMany.mockResolvedValue([]);
    expect(await listEvents(alice)).toEqual([]);
  });

  it("serves the sample data in demo mode", async () => {
    const events = await listEvents(demoNoDb);
    expect(events).toHaveLength(mockEvents.length);
    expect(db.event.findMany).not.toHaveBeenCalled();
  });

  it("surfaces a database failure to a real user instead of masking it with mocks", async () => {
    db.event.findMany.mockRejectedValue(new Error("db down"));
    await expect(listEvents(alice)).rejects.toThrow("db down");
  });
});

describe("getEvent / getEmail", () => {
  it("looks an event up by id AND owner", async () => {
    db.event.findFirst.mockResolvedValue(null);
    expect(await getEvent(alice, "someone-elses-event")).toBeNull();
    expect(db.event.findFirst).toHaveBeenCalledWith({ where: { id: "someone-elses-event", userId: "alice" } });
  });

  it("never falls back to a mock event for a real user", async () => {
    db.event.findFirst.mockResolvedValue(null);
    expect(await getEvent(alice, mockEvents[0].id)).toBeNull();
  });

  it("looks an email up by id AND owner", async () => {
    db.email.findFirst.mockResolvedValue(null);
    expect(await getEmail(alice, "em1")).toBeNull();
    expect(db.email.findFirst).toHaveBeenCalledWith({ where: { id: "em1", userId: "alice" } });
  });
});

describe("updateEvent", () => {
  it("refuses to touch an event the viewer does not own", async () => {
    db.event.findFirst.mockResolvedValue(null);
    expect(await updateEvent(alice, "ev1", { status: "ACCEPTED" })).toBeNull();
    expect(db.event.update).not.toHaveBeenCalled();
  });

  it("applies the change and reports the previous status", async () => {
    db.event.findFirst.mockResolvedValue({ status: "PENDING" });
    db.event.update.mockResolvedValue(row({ status: "ACCEPTED" }));

    const result = await updateEvent(alice, "ev1", { status: "ACCEPTED" });

    expect(result?.previousStatus).toBe("PENDING");
    expect(result?.event.status).toBe("ACCEPTED");
    expect(db.event.update.mock.calls[0][0]).toMatchObject({ where: { id: "ev1" }, data: { status: "ACCEPTED" } });
  });
});

describe("getSyncStatus", () => {
  it("reports the last Gmail pull and whether there is a Gmail to pull", async () => {
    db.event.count.mockResolvedValue(0);
    db.email.count.mockResolvedValue(0);
    db.email.findFirst.mockResolvedValue({ receivedAt: new Date("2026-10-27T13:05:00Z") });
    db.user.findUnique.mockResolvedValue({ lastScanAt: new Date("2026-10-27T17:00:00Z") });
    db.account.findFirst.mockResolvedValue({ scope: "openid email https://www.googleapis.com/auth/gmail.readonly" });

    const status = await getSyncStatus(alice);
    expect(status).toMatchObject({
      source: "db",
      lastIngest: "2026-10-27T13:05:00.000Z",
      lastScan: "2026-10-27T17:00:00.000Z",
      gmailConnected: true,
    });
  });

  it("has no scan to report for a sign-in-only account", async () => {
    db.event.count.mockResolvedValue(0);
    db.email.count.mockResolvedValue(0);
    db.email.findFirst.mockResolvedValue(null);
    db.user.findUnique.mockResolvedValue({ lastScanAt: null });
    db.account.findFirst.mockResolvedValue({ scope: "openid email profile" });

    const status = await getSyncStatus(alice);
    expect(status).toMatchObject({ lastScan: null, gmailConnected: false });
  });

  it("in demo mode, treats the sample inbox as swept when its newest email arrived", async () => {
    const status = await getSyncStatus(demoNoDb);
    expect(status.source).toBe("mock");
    expect(status.gmailConnected).toBe(true);
    expect(status.lastScan).toBe(status.lastIngest);
    expect(new Date(status.lastScan!).getTime()).toBeGreaterThan(Date.now() - 2 * 86_400_000);
  });
});
