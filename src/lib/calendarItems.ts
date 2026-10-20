import type { MockEvent } from "@/lib/mock/events";

/**
 * What the Calendar page draws: the user's own Google Calendar (classes,
 * yoga, coffee chats) plus the events they accepted in Lumi. Nothing
 * undecided ever appears here; that is what Today is for.
 *
 * Each item carries a category so the grid reads at a glance: classes one
 * colour, personal time another, coffee chats a third, Lumi's own accepted
 * events in ink, deadlines in red.
 */

export type CalendarCategory = "class" | "personal" | "coffee" | "lumi" | "deadline" | "other";

export type CalendarItem = {
  id: string;
  title: string;
  start: string; // ISO
  end: string; // ISO
  category: CalendarCategory;
  source: "google" | "lumi";
  location?: string;
  /** Lumi event id, when the item is one of ours (links to the event page). */
  eventId?: string;
};

export const CATEGORY_LABEL: Record<CalendarCategory, string> = {
  class: "Classes",
  personal: "Personal",
  coffee: "Coffee chats",
  lumi: "Accepted in Lumi",
  deadline: "Deadlines",
  other: "Other",
};

const CLASS_RE = /\b(cs-ua|math-ua|core-ua|econ-ua|lecture|recitation|seminar|lab|office hours|class|section|midterm|final exam)\b/i;
const PERSONAL_RE = /\b(yoga|gym|run|swim|pilates|barre|therapy|dentist|doctor|haircut|laundry|groceries|dinner with|brunch|lunch with)\b/i;
const COFFEE_RE = /\b(coffee|chat with|catch[- ]up|1:1|one[- ]on[- ]one|networking)\b/i;

/** A category from the title alone; Google Calendar gives us nothing else. */
export function categorizeTitle(title: string): CalendarCategory {
  if (CLASS_RE.test(title)) return "class";
  if (COFFEE_RE.test(title)) return "coffee";
  if (PERSONAL_RE.test(title)) return "personal";
  return "other";
}

/** A Lumi event is ours; deadlines keep their own colour. */
export function categorizeEvent(e: Pick<MockEvent, "kind">): CalendarCategory {
  return e.kind === "DEADLINE" ? "deadline" : "lumi";
}

function tokens(t: string): Set<string> {
  return new Set(
    t
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
}

function similar(a: string, b: string): boolean {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return false;
  let overlap = 0;
  for (const w of ta) if (tb.has(w)) overlap++;
  return overlap / Math.min(ta.size, tb.size) >= 0.6;
}

/**
 * The calendar as one list. Accepted Lumi events come first; a Google
 * Calendar entry that is the synced copy of one of them (same hour, same
 * words) is dropped so nothing shows twice.
 */
export function mergeItems(google: CalendarItem[], lumiAccepted: MockEvent[]): CalendarItem[] {
  const ours: CalendarItem[] = lumiAccepted.map((e) => ({
    id: `lumi-${e.id}`,
    title: e.title,
    start: e.startTime,
    end: e.endTime ?? new Date(new Date(e.startTime).getTime() + 3600_000).toISOString(),
    category: categorizeEvent(e),
    source: "lumi",
    location: e.locationName,
    eventId: e.id,
  }));
  const theirs = google.filter(
    (g) =>
      !ours.some(
        (o) => Math.abs(new Date(o.start).getTime() - new Date(g.start).getTime()) < 3600_000 && similar(o.title, g.title)
      )
  );
  return [...ours, ...theirs].sort((a, b) => a.start.localeCompare(b.start));
}

/* ─── Demo: a plausible student week, no real data ─── */

type Weekly = { weekday: number; h: number; m: number; minutes: number; title: string; location?: string; category: CalendarCategory };

const DEMO_WEEK: Weekly[] = [
  { weekday: 1, h: 11, m: 0, minutes: 75, title: "CS-UA 310 Algorithms", location: "Courant 102", category: "class" },
  { weekday: 3, h: 11, m: 0, minutes: 75, title: "CS-UA 310 Algorithms", location: "Courant 102", category: "class" },
  { weekday: 3, h: 12, m: 30, minutes: 75, title: "Linear Algebra Recitation", location: "CIWW 201", category: "class" },
  { weekday: 2, h: 7, m: 30, minutes: 60, title: "Yoga at 404", location: "404 Lafayette", category: "personal" },
  { weekday: 5, h: 15, m: 0, minutes: 45, title: "Coffee chat with Priya", location: "Think Coffee", category: "coffee" },
];

function at(base: Date, weekday: number, h: number, m: number): Date {
  const d = new Date(base);
  d.setDate(base.getDate() + weekday);
  d.setHours(h, m, 0, 0);
  return d;
}

/**
 * About four things a week for six weeks, from the start of this week:
 * two lectures, a recitation, yoga, a coffee chat. Titles are the kind of
 * thing a real calendar holds and nothing that identifies anyone.
 */
export function demoGoogleCalendar(now: Date = new Date(), weeks = 6): CalendarItem[] {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay()); // Sunday
  const out: CalendarItem[] = [];
  for (let w = 0; w < weeks; w++) {
    const base = new Date(start);
    base.setDate(start.getDate() + w * 7);
    for (const e of DEMO_WEEK) {
      // The coffee chat is a one-off in the first two weeks, not a standing meeting.
      if (e.category === "coffee" && w > 1) continue;
      const s = at(base, e.weekday, e.h, e.m);
      out.push({
        id: `demo-${w}-${e.weekday}-${e.h}${e.m}`,
        title: e.title,
        start: s.toISOString(),
        end: new Date(s.getTime() + e.minutes * 60_000).toISOString(),
        category: e.category,
        source: "google",
        location: e.location,
      });
    }
  }
  return out;
}
