/**
 * Google OAuth scopes, split by what they are for.
 *
 * Signing in asks for nothing sensitive: name and email only. An OAuth app
 * that requests only these scopes can be published to production without
 * Google's verification review, so anyone with a Google account can sign in
 * — no test-user list to maintain. Gmail and Google Calendar are a separate,
 * optional grant (CONNECT_SCOPES) that the user gives from onboarding or
 * Settings. Until the app is verified that step shows Google's "unverified
 * app" warning and is capped at 100 users; forwarding, Handshake and the
 * iCal feed need no Google permission at all.
 *
 * No server imports here: the client reads these too.
 */

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

export const SIGN_IN_SCOPES = ["openid", "email", "profile"].join(" ");
export const CONNECT_SCOPES = [SIGN_IN_SCOPES, GMAIL_SCOPE, CALENDAR_SCOPE].join(" ");

export type GoogleGrants = { gmail: boolean; calendar: boolean };

/** Which of Lumi's optional grants a space-separated scope string carries. */
export function grantsFromScope(scope: string | null | undefined): GoogleGrants {
  const set = new Set((scope ?? "").split(/\s+/).filter(Boolean));
  return { gmail: set.has(GMAIL_SCOPE), calendar: set.has(CALENDAR_SCOPE) };
}

/**
 * The union of two scope strings. A later sign-in that asked for less must
 * never make Lumi forget a grant the user already gave.
 */
export function mergeScopes(a: string | null | undefined, b: string | null | undefined): string {
  const out: string[] = [];
  for (const s of `${a ?? ""} ${b ?? ""}`.split(/\s+/)) {
    if (s && !out.includes(s)) out.push(s);
  }
  return out.join(" ");
}
