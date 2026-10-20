import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Poll } from "@/lib/meet";

const store = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/meetStore", () => ({ meetStore: () => store }));

import { GET } from "@/app/api/meet/[slug]/final.ics/route";

const poll: Poll = {
  slug: "abc",
  title: "Study group",
  timezone: "America/New_York",
  days: ["2026-10-20"],
  dayStart: 540,
  dayEnd: 1260,
  slotMinutes: 30,
  finalStart: "2026-10-20T16:00",
  finalEnd: "2026-10-20T18:00",
  expected: [],
  ownerId: null,
  createdAt: "2026-10-19T00:00:00Z",
};

const get = (slug: string) =>
  GET(new Request(`https://lumi.test/api/meet/${slug}/final.ics`), { params: Promise.resolve({ slug }) });

beforeEach(() => {
  vi.resetAllMocks();
});

describe("GET /api/meet/[slug]/final.ics", () => {
  it("404s for an unknown poll and for one with no pick yet", async () => {
    store.get.mockResolvedValueOnce(null);
    expect((await get("nope")).status).toBe(404);
    store.get.mockResolvedValueOnce({ poll: { ...poll, finalStart: null, finalEnd: null }, responses: [], tokens: new Map() });
    expect((await get("abc")).status).toBe(404);
  });

  it("serves the picked time as a .ics with the slot keys converted in the poll's zone", async () => {
    store.get.mockResolvedValueOnce({ poll, responses: [], tokens: new Map() });
    const res = await get("abc");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/calendar");
    expect(res.headers.get("content-disposition")).toContain('filename="abc.ics"');
    const body = await res.text();
    expect(body).toContain("DTSTART:20261020T200000Z");
    expect(body).toContain("DTEND:20261020T220000Z");
    expect(body).toContain("SUMMARY:Study group");
    expect(body).toContain("URL:https://lumi.test/meet/abc");
  });
});
