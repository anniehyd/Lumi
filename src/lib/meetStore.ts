import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { makeSlug, sanitizeSlots, type Poll, type Response } from "@/lib/meet";

/**
 * Where polls live.
 *
 * With a database, Prisma. Without one (demo mode, `npm run dev` with no
 * DATABASE_URL) an in-memory store that lasts as long as the server process,
 * seeded with one example poll so the page opens with something to look at.
 * Both implement the same five calls, so the routes never branch on mode.
 */

export type NewPoll = {
  title: string;
  days: string[];
  dayStart: number;
  dayEnd: number;
  slotMinutes: number;
  timezone: string;
  expected: string[];
  ownerId: string | null;
};

export type PollWithResponses = { poll: Poll; responses: Response[] };

export type StoredResponse = Response & { editToken: string };

export interface MeetStore {
  create(input: NewPoll): Promise<Poll>;
  get(slug: string): Promise<(PollWithResponses & { tokens: Map<string, string> }) | null>;
  respond(
    slug: string,
    input: { name: string; slots: string[]; editToken: string | null }
  ): Promise<{ ok: true; editToken: string } | { ok: false; error: string; status: number }>;
  setFinal(slug: string, range: { start: string; end: string } | null): Promise<Poll | null>;
  listForOwner(ownerId: string): Promise<(Poll & { responseCount: number })[]>;
}

function newToken(): string {
  return randomBytes(18).toString("base64url");
}

/* ─── Prisma ─── */

type Row = {
  slug: string;
  title: string;
  timezone: string;
  days: string[];
  dayStart: number;
  dayEnd: number;
  slotMinutes: number;
  finalStart: string | null;
  finalEnd: string | null;
  expected: string[];
  ownerId: string | null;
  createdAt: Date;
};

function rowToPoll(r: Row): Poll {
  return {
    slug: r.slug,
    title: r.title,
    timezone: r.timezone,
    days: r.days,
    dayStart: r.dayStart,
    dayEnd: r.dayEnd,
    slotMinutes: r.slotMinutes,
    finalStart: r.finalStart,
    finalEnd: r.finalEnd,
    expected: r.expected,
    ownerId: r.ownerId,
    createdAt: r.createdAt.toISOString(),
  };
}

const prismaStore: MeetStore = {
  async create(input) {
    const row = await prisma.meetPoll.create({ data: { ...input, slug: makeSlug() } });
    return rowToPoll(row);
  },
  async get(slug) {
    const row = await prisma.meetPoll.findUnique({
      where: { slug },
      include: { responses: { orderBy: { createdAt: "asc" } } },
    });
    if (!row) return null;
    const tokens = new Map(row.responses.map((r) => [r.name, r.editToken]));
    return {
      poll: rowToPoll(row),
      responses: row.responses.map((r) => ({ name: r.name, slots: r.slots, updatedAt: r.updatedAt.toISOString() })),
      tokens,
    };
  },
  async respond(slug, input) {
    const row = await prisma.meetPoll.findUnique({ where: { slug } });
    if (!row) return { ok: false, error: "poll not found", status: 404 };
    const slots = sanitizeSlots(row, input.slots);
    const existing = await prisma.meetResponse.findUnique({
      where: { pollId_name: { pollId: row.id, name: input.name } },
    });
    if (existing) {
      if (existing.editToken !== input.editToken) {
        return { ok: false, error: "That name is taken on this poll. Pick another, or open your own edit link.", status: 409 };
      }
      await prisma.meetResponse.update({ where: { id: existing.id }, data: { slots } });
      return { ok: true, editToken: existing.editToken };
    }
    const editToken = newToken();
    await prisma.meetResponse.create({ data: { pollId: row.id, name: input.name, slots, editToken } });
    return { ok: true, editToken };
  },
  async setFinal(slug, range) {
    const row = await prisma.meetPoll
      .update({
        where: { slug },
        data: { finalStart: range?.start ?? null, finalEnd: range?.end ?? null },
      })
      .catch(() => null);
    return row ? rowToPoll(row) : null;
  },
  async listForOwner(ownerId) {
    const rows = await prisma.meetPoll.findMany({
      where: { ownerId },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { _count: { select: { responses: true } } },
    });
    return rows.map((r) => ({ ...rowToPoll(r), responseCount: r._count.responses }));
  },
};

/* ─── In-memory, for demo mode ─── */

type MemPoll = { poll: Poll; responses: StoredResponse[] };

function nextMonday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
  return d;
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** One realistic poll: a study group picking a time next week, three answers in. */
function seedDemo(): Map<string, MemPoll> {
  const mon = nextMonday();
  const days = [0, 1, 2, 3, 4].map((i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return iso(d);
  });
  const k = (di: number, h: number, m = 0) => `${days[di]}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  const block = (di: number, fromH: number, toH: number) => {
    const out: string[] = [];
    for (let t = fromH * 60; t < toH * 60; t += 30) out.push(k(di, Math.floor(t / 60), t % 60));
    return out;
  };
  const poll: Poll = {
    slug: "demo-study-group",
    title: "Algorithms study group before the midterm",
    timezone: "America/New_York",
    days,
    dayStart: 10 * 60,
    dayEnd: 20 * 60,
    slotMinutes: 30,
    finalStart: null,
    finalEnd: null,
    expected: [],
    ownerId: null,
    createdAt: new Date().toISOString(),
  };
  const responses: StoredResponse[] = [
    { name: "Annie", slots: [...block(0, 10, 12), ...block(1, 14, 18), ...block(3, 10, 13), ...block(4, 15, 19)], editToken: "demo-annie", updatedAt: new Date().toISOString() },
    { name: "Marco", slots: [...block(0, 11, 13), ...block(1, 15, 20), ...block(2, 10, 12), ...block(3, 11, 13)], editToken: "demo-marco", updatedAt: new Date().toISOString() },
    { name: "Priya", slots: [...block(1, 16, 19), ...block(2, 10, 14), ...block(3, 12, 14), ...block(4, 15, 17)], editToken: "demo-priya", updatedAt: new Date().toISOString() },
  ];
  return new Map([[poll.slug, { poll, responses }]]);
}

declare global {
  var __lumiMeetMem: Map<string, MemPoll> | undefined;
}

function mem(): Map<string, MemPoll> {
  if (!globalThis.__lumiMeetMem) globalThis.__lumiMeetMem = seedDemo();
  return globalThis.__lumiMeetMem;
}

const memoryStore: MeetStore = {
  async create(input) {
    const poll: Poll = { ...input, slug: makeSlug(), finalStart: null, finalEnd: null, createdAt: new Date().toISOString() };
    mem().set(poll.slug, { poll, responses: [] });
    return poll;
  },
  async get(slug) {
    const entry = mem().get(slug);
    if (!entry) return null;
    return {
      poll: entry.poll,
      responses: entry.responses.map(({ name, slots, updatedAt }) => ({ name, slots, updatedAt })),
      tokens: new Map(entry.responses.map((r) => [r.name, r.editToken])),
    };
  },
  async respond(slug, input) {
    const entry = mem().get(slug);
    if (!entry) return { ok: false, error: "poll not found", status: 404 };
    const slots = sanitizeSlots(entry.poll, input.slots);
    const existing = entry.responses.find((r) => r.name === input.name);
    if (existing) {
      if (existing.editToken !== input.editToken) {
        return { ok: false, error: "That name is taken on this poll. Pick another, or open your own edit link.", status: 409 };
      }
      existing.slots = slots;
      existing.updatedAt = new Date().toISOString();
      return { ok: true, editToken: existing.editToken };
    }
    const editToken = newToken();
    entry.responses.push({ name: input.name, slots, editToken, updatedAt: new Date().toISOString() });
    return { ok: true, editToken };
  },
  async setFinal(slug, range) {
    const entry = mem().get(slug);
    if (!entry) return null;
    entry.poll = { ...entry.poll, finalStart: range?.start ?? null, finalEnd: range?.end ?? null };
    return entry.poll;
  },
  async listForOwner() {
    return [...mem().values()].map((e) => ({ ...e.poll, responseCount: e.responses.length }));
  },
};

export function meetStore(): MeetStore {
  return process.env.DATABASE_URL ? prismaStore : memoryStore;
}
