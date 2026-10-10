import { createHash } from "crypto";

/**
 * Rule-based pre-filter and input compaction — everything that decides, for
 * free, whether an email is worth a model call and how many tokens that call
 * carries.
 *
 * Runs after the keyword gate (keyword.ts). Each rule here is deterministic
 * and was checked against the 14-day golden set (scripts/eval-prefilter.ts):
 * a rule only ships if it drops zero emails the pipeline had found events in.
 */

export type SkipReason =
  /** Subject is a survey / review request; the prompt forbids extracting these anyway. */
  | "survey"
  /** No date, weekday, or clock time anywhere — there is nothing to put on a calendar. */
  | "no_temporal"
  /** Same sender + subject + body already went through the pipeline for this user. */
  | "duplicate"
  /** A reply whose new text carries no event language; the quoted part was already processed. */
  | "unchanged_thread"
  /** Bulk sender that has never produced an event for this user. */
  | "sender_history";

// ─── Compaction ───

const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;
// Zero-width and other invisible characters marketing mail pads its preheader with.
const INVISIBLE_RE = /[\u00ad\u034f\u061c\u180e\u200b-\u200f\u2028\u2029\u202a-\u202e\u2060-\u2064\ufeff]/g;

/** Hard ceiling on what one email may send to the model, after compaction. */
export const MAX_MODEL_CHARS = 48_000;

export type Compacted = {
  text: string;
  /** links[i] is the URL behind placeholder `[L{i+1}]`. */
  links: string[];
  /** True when the text was cut at MAX_MODEL_CHARS. */
  truncated: boolean;
};

/**
 * Shrink an email body without removing anything the extractor reads.
 *
 * Tracking links are the bulk of a newsletter's plain-text part (60–93% of
 * characters across the golden set), and the model needs to know only that a
 * link exists and which one it is. Each distinct URL becomes a short `[Ln]`
 * placeholder; restoreLink() maps the model's answer back to the real URL.
 */
export function compactBody(body: string, opts: { links?: boolean } = {}): Compacted {
  const links: string[] = [];
  const index = new Map<string, number>();
  let text = body.replace(INVISIBLE_RE, "");

  if (opts.links !== false) {
    text = text.replace(URL_RE, (raw) => {
      // Sentence punctuation glued to the end of a URL is not part of it.
      const url = raw.replace(/[.,;:!?]+$/, "");
      const tail = raw.slice(url.length);
      let n = index.get(url);
      if (n === undefined) {
        links.push(url);
        n = links.length;
        index.set(url, n);
      }
      return `[L${n}]${tail}`;
    });
  }

  text = text
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const truncated = text.length > MAX_MODEL_CHARS;
  if (truncated) text = text.slice(0, MAX_MODEL_CHARS);
  return { text, links, truncated };
}

/**
 * Turn what the model returned for a link field back into a real URL.
 * A placeholder resolves through the table; a literal URL is kept only if it
 * was actually in the email, so a hallucinated link never reaches the UI.
 */
export function restoreLink(value: string | undefined | null, links: string[]): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  const placeholder = /^\[?L(\d+)\]?$/i.exec(trimmed);
  if (placeholder) return links[Number(placeholder[1]) - 1];
  if (!/^https?:\/\//i.test(trimmed)) return undefined;
  if (links.length === 0) return trimmed; // compaction was off; nothing to check against
  return links.includes(trimmed.replace(/[.,;:!?]+$/, "")) ? trimmed : undefined;
}

// ─── Temporal signal ───

const MONTH = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const TEMPORAL_RES = [
  // Aug 17 · August 17th · 17 August
  new RegExp(`\\b(?:${MONTH})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?\\b`, "i"),
  new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?(?:${MONTH})\\b`, "i"),
  // 8/17 · 08.17.2026 · 2026-08-17
  /\b\d{1,2}[/.]\d{1,2}(?:[/.]\d{2,4})?\b/,
  /\b\d{4}-\d{2}-\d{2}\b/,
  // 5pm · 5:30 PM · 17:00 · noon
  /\b\d{1,2}(?::\d{2})?\s?(?:a\.?m\.?|p\.?m\.?)(?![a-z])/i,
  /\b(?:[01]?\d|2[0-3]):[0-5]\d\b/,
  /\b(?:noon|midnight)\b/i,
  // Monday · Thurs · tomorrow · tonight · next week
  /\b(?:mon|tues?|wed(?:nes)?|thur?s?|fri|sat(?:ur)?|sun)(?:day)?s?\b/i,
  /\b(?:today|tonight|tomorrow|this (?:week|weekend|evening|afternoon|morning)|next (?:week|month))\b/i,
];

/**
 * Does the text contain anything that could anchor an event in time?
 * Deliberately generous: a false "yes" costs one model call, a false "no"
 * costs a missed event. Call on text with URLs already removed — query
 * strings are full of date-shaped digits.
 */
export function hasTemporalSignal(text: string): boolean {
  return TEMPORAL_RES.some((re) => re.test(text));
}

// ─── Surveys ───

const SURVEY_SUBJECT_RE =
  /\b(?:survey|questionnaire|help us improve|rate your|how would you rate|how did we do|leave (?:us )?a review|share your feedback|your feedback)\b/i;

export function isSurveySubject(subject: string): boolean {
  return SURVEY_SUBJECT_RE.test(subject);
}

// ─── Bulk mail ───

const BULK_BODY_RE = /\bunsubscribe\b|manage (?:your )?(?:email )?preferences|email preferences|view (?:this email )?in (?:your )?browser|opt[- ]out/i;

/**
 * Is this list / marketing mail rather than a person writing to the user?
 * The sender-history rule only ever applies to bulk mail: a human who wrote
 * three non-event emails must still be read on the fourth.
 */
export function isBulk(body: string, hasListUnsubscribeHeader = false): boolean {
  return hasListUnsubscribeHeader || BULK_BODY_RE.test(body);
}

// ─── Reply threads ───

const QUOTE_BOUNDARY_RES = [
  /^On .{1,200} wrote:\s*$/m,
  /^-{2,}\s*Original Message\s*-{2,}\s*$/im,
  /^From: .+\r?\n(?:Sent|Date): .+$/m,
  /^_{10,}\s*$/m,
];

export function isReplySubject(subject: string): boolean {
  return /^\s*re\s*:/i.test(subject);
}

/** The text the sender actually wrote, without the quoted history below it. */
export function stripQuotedReply(body: string): string {
  let cut = body.length;
  for (const re of QUOTE_BOUNDARY_RES) {
    const m = re.exec(body);
    if (m && m.index < cut) cut = m.index;
  }
  return body
    .slice(0, cut)
    .split(/\r?\n/)
    .filter((line) => !/^\s*>/.test(line))
    .join("\n")
    .trim();
}

// ─── Content hash ───

/** The bare address out of a From header: `Name <a@b.com>` → `a@b.com`. */
export function senderAddress(from: string): string {
  const angle = /<([^<>]+)>/.exec(from);
  const raw = angle ? angle[1] : (/[^\s<>"]+@[^\s<>"]+/.exec(from)?.[0] ?? from);
  return raw.trim().toLowerCase();
}

/**
 * Identity of an email's content, ignoring what varies between copies of the
 * same mailing: tracking URLs, whitespace, invisible padding. Two recipients
 * lists delivering the same announcement hash the same.
 */
export function contentHash(from: string, subject: string, body: string): string {
  const norm = body
    .replace(INVISIBLE_RE, "")
    .replace(URL_RE, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  return createHash("sha256")
    .update(`${senderAddress(from)}\n${subject.trim().toLowerCase()}\n${norm}`)
    .digest("hex")
    .slice(0, 32);
}

// ─── Sender history ───

export type SenderHistory = {
  /** Model calls spent on this sender's mail. */
  llmCalls: number;
  /** Events those calls produced. */
  eventsFound: number;
  /** Emails skipped by this rule since the last one that was let through. */
  skippedSinceProbe: number;
};

/** Model calls with zero events before a bulk sender is muted. */
export const SENDER_MUTE_AFTER = 3;
/** While muted, every Nth email is still sent to the model so a sender that starts announcing events is noticed. */
export const SENDER_PROBE_EVERY = 5;

export function shouldMuteSender(h: SenderHistory | null | undefined): boolean {
  if (!h) return false;
  if (h.eventsFound > 0 || h.llmCalls < SENDER_MUTE_AFTER) return false;
  return h.skippedSinceProbe < SENDER_PROBE_EVERY - 1;
}

// ─── The stateless verdict ───

export type PrefilterInput = { subject: string; bodyText: string };

/**
 * Rules that need nothing but the email itself. The stateful rules
 * (duplicate, unchanged_thread, sender_history) live in detect.ts, next to
 * the database lookups they depend on.
 */
export function prefilter(msg: PrefilterInput): { pass: true } | { pass: false; reason: SkipReason } {
  if (isSurveySubject(msg.subject)) return { pass: false, reason: "survey" };
  const withoutUrls = `${msg.subject}\n${msg.bodyText.replace(URL_RE, " ")}`;
  if (!hasTemporalSignal(withoutUrls)) return { pass: false, reason: "no_temporal" };
  return { pass: true };
}
