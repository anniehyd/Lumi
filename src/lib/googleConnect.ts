import { signIn } from "next-auth/react";
import { CONNECT_SCOPES } from "@/lib/googleScopes";

/**
 * Ask the signed-in user for Gmail + Google Calendar access.
 *
 * This is a second Google authorization on the same account: NextAuth sends
 * the user through Google again with the wider scope, Google asks for
 * consent, and events.signIn in src/lib/auth.ts stores the resulting tokens
 * on their existing Account row. `prompt=consent` is what makes Google issue
 * a refresh token, which the twice-daily sweep needs to read mail while the
 * user is away.
 *
 * Until Google has verified Lumi this screen carries an "unverified app"
 * warning (Advanced → Continue) and is limited to 100 users. Nothing about
 * plain sign-in is affected by that.
 */
export function connectGoogle(callbackUrl = "/settings") {
  return signIn(
    "google",
    { callbackUrl },
    { scope: CONNECT_SCOPES, prompt: "consent", access_type: "offline", include_granted_scopes: "true" }
  );
}
