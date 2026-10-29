/**
 * How old the last Gmail pull is, in words the dashboard's date line can use.
 *
 * The sweep runs twice a day (1 PM and 7 PM New York), so the longest normal
 * gap is eighteen hours. Anything older than STALE_MS means a sweep was
 * missed and the list on screen may be behind the inbox; the page then says
 * so and offers Scan now. Users who only forward mail have no sweep to be
 * late, so they get no warning at all.
 */
export const STALE_MS = 20 * 3600_000;

const DAY = 24 * 3600_000;

export type ScanState =
  /** Pulled recently: "scanned at 9:02 AM". */
  | { kind: "fresh"; label: string }
  /** A sweep was missed: "last scanned yesterday at 7:02 PM". */
  | { kind: "stale"; label: string }
  /** Gmail is connected but has never been pulled. */
  | { kind: "never" }
  /** No Gmail: nothing to report. */
  | { kind: "none" };

export function scanState(
  lastScan: string | null | undefined,
  gmailConnected: boolean,
  now = Date.now(),
  timeZone?: string
): ScanState {
  if (!gmailConnected) return { kind: "none" };
  if (!lastScan) return { kind: "never" };
  const at = new Date(lastScan).getTime();
  if (!Number.isFinite(at)) return { kind: "never" };
  const when = whenLabel(at, now, timeZone);
  if (now - at > STALE_MS) return { kind: "stale", label: `last scanned ${when}` };
  return { kind: "fresh", label: `scanned ${when}` };
}

/** YYYY-MM-DD in the given zone, so "yesterday" is the user's yesterday. */
function localDay(ms: number, timeZone?: string): string {
  try {
    return new Date(ms).toLocaleDateString("en-CA", { timeZone });
  } catch {
    return new Date(ms).toLocaleDateString("en-CA");
  }
}

/** "at 9:02 AM", "yesterday at 7:02 PM", "Sunday at 7:02 PM", or "Oct 12" once it is a week old. */
export function whenLabel(at: number, now = Date.now(), timeZone?: string): string {
  const opts = { timeZone } as Intl.DateTimeFormatOptions;
  const time = (() => {
    try {
      return new Date(at).toLocaleTimeString("en-US", { ...opts, hour: "numeric", minute: "2-digit" });
    } catch {
      return new Date(at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    }
  })();
  const day = localDay(at, timeZone);
  if (day === localDay(now, timeZone)) return `at ${time}`;
  if (day === localDay(now - DAY, timeZone)) return `yesterday at ${time}`;
  if (now - at < 6 * DAY) {
    const weekday = new Date(at).toLocaleDateString("en-US", { ...opts, weekday: "long" });
    return `${weekday} at ${time}`;
  }
  return new Date(at).toLocaleDateString("en-US", { ...opts, month: "short", day: "numeric" });
}
