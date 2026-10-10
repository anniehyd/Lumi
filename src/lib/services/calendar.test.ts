import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ event: { findFirst: vi.fn(), update: vi.fn() } }));
const api = vi.hoisted(() => ({ list: vi.fn(), insert: vi.fn(), delete: vi.fn() }));
const token = vi.hoisted(() => vi.fn());
const metrics = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/auth", () => ({ getGoogleAccessToken: token }));
vi.mock("@/lib/metrics", () => ({
  recordMetrics: metrics,
  decisionDelta: (from: string, to: string) => (from === to ? {} : { eventsAccepted: 1 }),
}));
// Google's client is replaced entirely — no test here can create, change or
// delete anything on a real calendar.
vi.mock("googleapis", () => ({
  google: {
    auth: { OAuth2: class { setCredentials() {} } },
    calendar: () => ({ events: api }),
  },
}));
vi.mock("@/lib/retry", async (original) => {
  const real = await original<typeof import("@/lib/retry")>();
  return { ...real, withRetry: (fn: () => Promise<unknown>, opts = {}) => real.withRetry(fn, { ...opts, sleep: async () => {} }) };
});

import {
  findConflict,
  listCalendarWindow,
  newCalendarEventId,
  syncEventToCalendar,
  unsyncEvent,
} from "@/lib/services/calendar";

const stored = (over: Record<string, unknown> = {}) => ({
  id: "ev1",
  userId: "u1",
  status: "PENDING",
  title: "Info session",
  description: "Meet the team.",
  rsvpLink: "https://example.edu/rsvp",
  locationName: "Kimmel 405",
  locationAddress: null,
  startTime: new Date("2099-09-17T22:00:00Z"),
  endTime: null,
  timezone: "America/New_York",
  calendarEventId: null,
  conflictIds: [],
  ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  token.mockResolvedValue("access-token");
  db.event.update.mockResolvedValue({});
  api.list.mockResolvedValue({ data: { items: [] } });
  api.insert.mockResolvedValue({ data: {} });
  api.delete.mockResolvedValue({});
  metrics.mockResolvedValue(undefined);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("findConflict", () => {
  const busy = [{ title: "Linear Algebra", start: new Date("2099-01-01T15:00:00Z"), end: new Date("2099-01-01T16:00:00Z") }];

  it("reports an overlap", () => {
    expect(findConflict(busy, new Date("2099-01-01T15:30:00Z"), new Date("2099-01-01T16:30:00Z"))).toBe("Linear Algebra");
  });

  it("treats back-to-back events as no conflict", () => {
    expect(findConflict(busy, new Date("2099-01-01T16:00:00Z"), new Date("2099-01-01T17:00:00Z"))).toBeNull();
    expect(findConflict(busy, new Date("2099-01-01T14:00:00Z"), new Date("2099-01-01T15:00:00Z"))).toBeNull();
  });
});

describe("listCalendarWindow", () => {
  const window = [new Date("2099-01-01T00:00:00Z"), new Date("2099-01-02T00:00:00Z")] as const;

  it("returns null, not an error, when the user has no Google connection", async () => {
    token.mockResolvedValue(null);
    expect(await listCalendarWindow("u1", ...window)).toBeNull();
    expect(api.list).not.toHaveBeenCalled();
  });

  it("drops cancelled events and maps the rest", async () => {
    api.list.mockResolvedValue({
      data: {
        items: [
          { summary: "Class", status: "confirmed", start: { dateTime: "2099-01-01T15:00:00Z" }, end: { dateTime: "2099-01-01T16:00:00Z" } },
          { summary: "Gone", status: "cancelled", start: { dateTime: "2099-01-01T17:00:00Z" }, end: { dateTime: "2099-01-01T18:00:00Z" } },
        ],
      },
    });
    const slots = await listCalendarWindow("u1", ...window);
    expect(slots?.map((s) => s.title)).toEqual(["Class"]);
  });

  it("retries a transient failure", async () => {
    api.list.mockRejectedValueOnce({ code: 503 }).mockResolvedValueOnce({ data: { items: [] } });
    expect(await listCalendarWindow("u1", ...window)).toEqual([]);
    expect(api.list).toHaveBeenCalledTimes(2);
  });

  it("returns null when the call keeps failing — conflicts unknown, sweep unaffected", async () => {
    api.list.mockRejectedValue({ code: 500 });
    expect(await listCalendarWindow("u1", ...window)).toBeNull();
  });
});

describe("syncEventToCalendar", () => {
  it("inserts once and records the id it chose", async () => {
    db.event.findFirst.mockResolvedValue(stored());
    const result = await syncEventToCalendar("u1", "ev1");

    expect(api.insert).toHaveBeenCalledTimes(1);
    const body = api.insert.mock.calls[0][0].requestBody;
    expect(body.id).toMatch(/^lumi[0-9a-f]{32}$/);
    expect(body).toMatchObject({ summary: "Info session", location: "Kimmel 405" });
    expect(result?.calendarEventId).toBe(body.id);
    expect(db.event.update.mock.calls[0][0].data).toMatchObject({ calendarEventId: body.id, status: "ACCEPTED" });
  });

  it("does not insert a second copy when the event is already on the calendar", async () => {
    db.event.findFirst.mockResolvedValue(stored({ calendarEventId: "lumiabc", status: "ACCEPTED" }));
    const result = await syncEventToCalendar("u1", "ev1");

    expect(result).toEqual({ calendarEventId: "lumiabc", conflicts: [] });
    expect(api.insert).not.toHaveBeenCalled();
    expect(db.event.update).not.toHaveBeenCalled();
  });

  it("reuses the same id across retries, so a retry cannot duplicate", async () => {
    db.event.findFirst.mockResolvedValue(stored());
    api.insert.mockRejectedValueOnce({ code: 503 }).mockResolvedValueOnce({ data: {} });

    await syncEventToCalendar("u1", "ev1");

    const ids = api.insert.mock.calls.map((c) => c[0].requestBody.id);
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(ids[1]);
  });

  it("treats 409 on a retry as success — the first attempt landed", async () => {
    db.event.findFirst.mockResolvedValue(stored());
    api.insert.mockRejectedValueOnce({ code: 503 }).mockRejectedValueOnce({ code: 409 });

    const result = await syncEventToCalendar("u1", "ev1");

    expect(result?.calendarEventId).toMatch(/^lumi/);
    expect(db.event.update).toHaveBeenCalled();
  });

  it("propagates a permanent failure and stores nothing", async () => {
    db.event.findFirst.mockResolvedValue(stored());
    api.insert.mockRejectedValue({ code: 403 });

    await expect(syncEventToCalendar("u1", "ev1")).rejects.toEqual({ code: 403 });
    expect(db.event.update).not.toHaveBeenCalled();
  });

  it("only touches the requesting user's event", async () => {
    db.event.findFirst.mockResolvedValue(null);
    expect(await syncEventToCalendar("u1", "not-mine")).toBeNull();
    expect(db.event.findFirst).toHaveBeenCalledWith({ where: { id: "not-mine", userId: "u1" } });
    expect(api.insert).not.toHaveBeenCalled();
  });
});

describe("unsyncEvent", () => {
  it("deletes the calendar entry and clears the pointer", async () => {
    db.event.findFirst.mockResolvedValue(stored({ calendarEventId: "lumiabc" }));
    expect(await unsyncEvent("u1", "ev1")).toBe(true);
    expect(api.delete).toHaveBeenCalledWith({ calendarId: "primary", eventId: "lumiabc" });
    expect(db.event.update.mock.calls[0][0].data).toEqual({ calendarEventId: null, conflictIds: [] });
  });

  it("clears the pointer when the entry was already deleted by hand", async () => {
    db.event.findFirst.mockResolvedValue(stored({ calendarEventId: "lumiabc" }));
    api.delete.mockRejectedValue({ code: 410 });
    expect(await unsyncEvent("u1", "ev1")).toBe(true);
    expect(db.event.update).toHaveBeenCalled();
  });

  it("keeps the pointer when the delete genuinely failed", async () => {
    db.event.findFirst.mockResolvedValue(stored({ calendarEventId: "lumiabc" }));
    api.delete.mockRejectedValue({ code: 500 });
    expect(await unsyncEvent("u1", "ev1")).toBe(false);
    expect(db.event.update).not.toHaveBeenCalled();
  });

  it("is a no-op for an event that was never synced", async () => {
    db.event.findFirst.mockResolvedValue(stored());
    expect(await unsyncEvent("u1", "ev1")).toBe(false);
    expect(api.delete).not.toHaveBeenCalled();
  });
});

describe("newCalendarEventId", () => {
  it("produces ids Google accepts (base32hex, 5–1024 chars) and does not repeat", () => {
    const a = newCalendarEventId();
    expect(a).toMatch(/^[a-v0-9]{5,1024}$/);
    expect(newCalendarEventId()).not.toBe(a);
  });
});
