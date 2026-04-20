/**
 * Fast keyword classifier — decides whether an email is *plausibly* event-bearing.
 * Purpose: avoid spending LLM tokens on obvious non-events (newsletters, receipts).
 * Not an extractor — it only gates access to the LLM fallback.
 */

const STRONG_EVENT = [
  "rsvp",
  "invite",
  "invitation",
  "you're invited",
  "join us",
  "please join",
  "save the date",
  "reception",
  "dinner at",
  "coffee chat",
  "info session",
  "information session",
  "happy hour",
  "networking",
  "fireside chat",
  "panel discussion",
  "application deadline",
  "deadline:",
  "apply by",
  "meeting tomorrow",
];

const NEGATIVE = [
  "unsubscribe to stop",
  "order confirmation",
  "receipt",
  "password reset",
  "verify your email",
  "security alert",
  "newsletter archive",
];

export type KeywordVerdict = {
  hit: boolean;
  score: number; // 0..1
  matches: string[];
};

export function classifyKeyword(subject: string, body: string): KeywordVerdict {
  const text = `${subject}\n${body}`.toLowerCase();

  const negatives = NEGATIVE.filter((kw) => text.includes(kw));
  if (negatives.length >= 2) return { hit: false, score: 0, matches: [] };

  const matches = STRONG_EVENT.filter((kw) => text.includes(kw));
  const score = Math.min(1, matches.length * 0.3);
  return { hit: matches.length > 0, score, matches };
}
