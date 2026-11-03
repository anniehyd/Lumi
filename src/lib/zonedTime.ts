import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

/**
 * Times that arrive without an offset belong to a place, not to the server.
 *
 * The model, schema.org markup and floating ICS times can all hand back
 * "2026-11-05T18:00:00" or a bare "2026-11-05". `new Date()` reads those in
 * the server's zone, which on a deployment is UTC, so "6 PM" became 1 PM in
 * New York and a date-only deadline became 7 PM the evening before. These
 * helpers read them in the event's (or the user's) zone instead.
 */

export const DEFAULT_TIMEZONE = "America/New_York";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_DATE_TIME = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)$/;

/** An IANA zone the runtime understands, else the default. */
export function validTimeZone(tz: string | null | undefined): string {
  const zone = tz?.trim();
  if (!zone) return DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return zone;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

export type ZonedInstant = {
  at: Date;
  /** True when the input carried a date and no time: an all-day value. */
  dateOnly: boolean;
};

/**
 * Parse a time string. An explicit offset or "Z" is respected as given; a
 * wall-clock time with no offset is read in `timeZone`; a bare date becomes
 * midnight in `timeZone` and is flagged `dateOnly`. Null for anything that
 * does not parse: model output is untrusted.
 */
export function parseInTimeZone(value: string | null | undefined, timeZone: string | null | undefined): ZonedInstant | null {
  const v = value?.trim();
  if (!v) return null;
  const zone = validTimeZone(timeZone);

  let at: Date;
  let dateOnly = false;
  if (DATE_ONLY.test(v)) {
    at = fromZonedTime(`${v}T00:00:00`, zone);
    dateOnly = true;
  } else {
    const local = LOCAL_DATE_TIME.exec(v);
    at = local ? fromZonedTime(`${local[1]}T${local[2]}`, zone) : new Date(v);
  }
  return Number.isNaN(at.getTime()) ? null : { at, dateOnly };
}

/** The calendar date of an instant where it happens: "2026-11-05". */
export function localDate(at: Date, timeZone: string | null | undefined): string {
  return formatInTimeZone(at, validTimeZone(timeZone), "yyyy-MM-dd");
}

/** "2026-11-05" plus n days, on the calendar (no time zone involved). */
export function addCalendarDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return next.toISOString().slice(0, 10);
}

/** "Thu, Nov 5" for an all-day event, on its own calendar date wherever the viewer is. */
export function allDayDate(startISO: string, timeZone: string | null | undefined, pattern = "EEE, MMM d"): string {
  return formatInTimeZone(new Date(startISO), validTimeZone(timeZone), pattern);
}

/** Midnight at the start of a calendar date in a zone. */
export function startOfLocalDate(date: string, timeZone: string | null | undefined): Date {
  return fromZonedTime(`${date}T00:00:00`, validTimeZone(timeZone));
}
