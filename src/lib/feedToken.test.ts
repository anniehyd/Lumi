import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ prisma: db }));

import {
  feedUrls,
  getOrCreateFeedToken,
  mintFeedToken,
  resolveFeedUser,
  rotateFeedToken,
} from "@/lib/feedToken";

const HEX48 = /^[a-f0-9]{48}$/;

beforeEach(() => {
  vi.resetAllMocks();
  delete process.env.CALENDAR_FEED_TOKEN;
  delete process.env.CALENDAR_FEED_EMAIL;
});

describe("mintFeedToken", () => {
  it("is 48 lowercase hex characters and differs every call", () => {
    const a = mintFeedToken();
    const b = mintFeedToken();
    expect(a).toMatch(HEX48);
    expect(b).toMatch(HEX48);
    expect(a).not.toBe(b);
  });
});

describe("getOrCreateFeedToken", () => {
  it("returns the stored token without writing", async () => {
    db.user.findUnique.mockResolvedValue({ calendarFeedToken: "a".repeat(48) });
    expect(await getOrCreateFeedToken("u1")).toBe("a".repeat(48));
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("mints and stores one when the user has none", async () => {
    db.user.findUnique.mockResolvedValue({ calendarFeedToken: null });
    db.user.update.mockResolvedValue({});
    const token = await getOrCreateFeedToken("u1");
    expect(token).toMatch(HEX48);
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { calendarFeedToken: token },
    });
  });
});

describe("rotateFeedToken", () => {
  it("always writes a fresh token", async () => {
    db.user.update.mockResolvedValue({});
    const token = await rotateFeedToken("u1");
    expect(token).toMatch(HEX48);
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { calendarFeedToken: token },
    });
  });
});

describe("resolveFeedUser", () => {
  it("rejects an empty token", async () => {
    expect(await resolveFeedUser("")).toBeNull();
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it("maps a per-user token to its owner", async () => {
    const token = "b".repeat(48);
    db.user.findUnique.mockResolvedValue({ id: "u2" });
    expect(await resolveFeedUser(token)).toBe("u2");
    expect(db.user.findUnique).toHaveBeenCalledWith({
      where: { calendarFeedToken: token },
      select: { id: true },
    });
  });

  it("does not hit the database for a token that cannot be per-user", async () => {
    expect(await resolveFeedUser("not-a-token")).toBeNull();
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it("returns null for an unknown per-user token", async () => {
    db.user.findUnique.mockResolvedValue(null);
    expect(await resolveFeedUser("c".repeat(48))).toBeNull();
  });

  it("honours the legacy deployment token for the configured email", async () => {
    process.env.CALENDAR_FEED_TOKEN = "legacy-secret";
    process.env.CALENDAR_FEED_EMAIL = "owner@example.edu";
    db.user.findUnique.mockResolvedValue({ id: "owner" });
    expect(await resolveFeedUser("legacy-secret")).toBe("owner");
    expect(db.user.findUnique).toHaveBeenCalledWith({
      where: { email: "owner@example.edu" },
      select: { id: true },
    });
  });

  it("legacy token without an email resolves only when there is exactly one user", async () => {
    process.env.CALENDAR_FEED_TOKEN = "legacy-secret";
    db.user.findMany.mockResolvedValueOnce([{ id: "only" }]);
    expect(await resolveFeedUser("legacy-secret")).toBe("only");
    db.user.findMany.mockResolvedValueOnce([{ id: "a" }, { id: "b" }]);
    expect(await resolveFeedUser("legacy-secret")).toBeNull();
  });

  it("rejects a wrong legacy token", async () => {
    process.env.CALENDAR_FEED_TOKEN = "legacy-secret";
    expect(await resolveFeedUser("legacy-secre")).toBeNull();
    expect(await resolveFeedUser("legacy-secret!")).toBeNull();
  });
});

describe("feedUrls", () => {
  it("builds https and webcal forms", () => {
    expect(feedUrls("https://lumi.example", "t")).toEqual({
      https: "https://lumi.example/api/calendar.ics?token=t",
      webcal: "webcal://lumi.example/api/calendar.ics?token=t",
    });
    expect(feedUrls("http://localhost:3000", "t").webcal).toBe(
      "webcal://localhost:3000/api/calendar.ics?token=t"
    );
  });
});
