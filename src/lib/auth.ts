import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/lib/db";
import { withRetry } from "@/lib/retry";
import { SIGN_IN_SCOPES, grantsFromScope, mergeScopes, type GoogleGrants } from "@/lib/googleScopes";
import { hasRoomForNewUser } from "@/lib/limits";
import { isAdminEmail } from "@/lib/adminAccess";

// How often a live session re-stamps User.lastSeenAt. The stamp only has to
// tell "this week" from "weeks ago", so one write per half day is plenty.
const SEEN_STAMP_MS = 12 * 60 * 60 * 1000;

// Demo mode has no Google OAuth configured, so sign-in is impossible and the
// secret only signs empty-session cookies — a static fallback keeps
// /api/auth/session from 500ing. Real deployments (Google creds set) still
// require a real NEXTAUTH_SECRET.
const demoSecret =
  !process.env.NEXTAUTH_SECRET && !process.env.GOOGLE_CLIENT_ID
    ? "lumi-demo-mode-not-a-secret"
    : process.env.NEXTAUTH_SECRET;

export const authOptions: NextAuthOptions = {
  secret: demoSecret,
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      // Sign-in asks for name and email only (src/lib/googleScopes.ts).
      // Gmail and Calendar are requested later by connectGoogle(), which
      // overrides `scope` and `prompt` for that one authorization.
      // include_granted_scopes keeps every earlier grant on the new token, so
      // a plain sign-in after connecting does not hand back a narrower one.
      authorization: {
        params: {
          scope: SIGN_IN_SCOPES,
          access_type: "offline",
          include_granted_scopes: "true",
          prompt: "select_account",
        },
      },
    }),
  ],
  session: { strategy: "database" },
  callbacks: {
    /**
     * The door. Anyone with a Google account may sign in — there is no list
     * to be on — until the deployment holds LUMI_MAX_USERS accounts. After
     * that only people who already have one get in; a newcomer is sent back
     * to the landing page, which says the beta is full.
     */
    async signIn({ account }) {
      if (!account) return true;
      try {
        const known = await prisma.account.findUnique({
          where: {
            provider_providerAccountId: {
              provider: account.provider,
              providerAccountId: account.providerAccountId,
            },
          },
          select: { id: true },
        });
        if (known) return true;
      } catch {
        return true;
      }
      return (await hasRoomForNewUser()) ? true : "/?full=1";
    },
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        session.user.isAdmin = isAdminEmail(user.email);
      }
      const seen = (user as { lastSeenAt?: Date | null }).lastSeenAt;
      if (!seen || Date.now() - new Date(seen).getTime() > SEEN_STAMP_MS) {
        // Not awaited into the response path's failure modes: a missed stamp
        // costs nothing, a thrown one would sign the user out.
        await prisma.user
          .update({ where: { id: user.id }, data: { lastSeenAt: new Date() } })
          .catch(() => {});
      }
      return session;
    },
  },
  events: {
    /**
     * NextAuth creates the Account row on first sign-in and never touches it
     * again, so a later authorization — the Gmail + Calendar grant — would be
     * thrown away. Persist what Google just returned. The scope is merged,
     * never replaced, and a missing refresh token keeps the old one: Google
     * only issues a refresh token on a consent prompt.
     */
    async signIn({ user, account, isNewUser }) {
      if (!account || isNewUser || account.provider !== "google") return;
      const existing = await prisma.account.findUnique({
        where: {
          provider_providerAccountId: {
            provider: account.provider,
            providerAccountId: account.providerAccountId,
          },
        },
        select: { id: true, userId: true, scope: true },
      });
      if (!existing || existing.userId !== user.id) return;
      await prisma.account.update({
        where: { id: existing.id },
        data: {
          access_token: account.access_token ?? undefined,
          expires_at: account.expires_at ?? undefined,
          id_token: account.id_token ?? undefined,
          refresh_token: account.refresh_token ?? undefined,
          scope: mergeScopes(existing.scope, account.scope),
        },
      });
    },
  },
  pages: {
    signIn: "/",
  },
};

/**
 * Which optional Google grants this user has given. Everyone signs in with
 * Google, but that alone grants nothing: a user who never connected Gmail
 * and Calendar (they forward mail instead, src/lib/forwardingToken.ts) gets
 * { gmail: false, calendar: false } and callers degrade to the iCal feed
 * rather than report an error.
 */
export async function googleGrants(userId: string): Promise<GoogleGrants> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
    select: { scope: true },
  });
  return grantsFromScope(account?.scope);
}

/**
 * Fetch a user's Google access token, refreshing if expired. `requiredScope`
 * is the API the caller is about to use; a token the user never granted it
 * for is reported as null, the same as no connection, so no Gmail or
 * Calendar call is ever made on a sign-in-only account.
 * Returns null if the user isn't connected or refresh fails.
 */
export async function getGoogleAccessToken(userId: string, requiredScope?: string): Promise<string | null> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
  });
  if (!account) return null;
  if (requiredScope && !(account.scope ?? "").split(/\s+/).includes(requiredScope)) return null;

  const now = Math.floor(Date.now() / 1000);
  if (account.access_token && account.expires_at && account.expires_at > now + 30) {
    return account.access_token;
  }
  if (!account.refresh_token) return account.access_token ?? null;

  // Refresh via Google OAuth token endpoint.
  // A 5xx or a dropped connection here used to read as "user not connected"
  // and silently skip their whole sweep; only a real rejection (4xx — the
  // grant was revoked or expired) should do that.
  const refreshToken = account.refresh_token;
  let res: Response;
  try {
    res = await withRetry(
      async () => {
        const r = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: process.env.GOOGLE_CLIENT_ID ?? "",
            client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
            grant_type: "refresh_token",
            refresh_token: refreshToken,
          }),
          signal: AbortSignal.timeout(15_000),
        });
        if (r.status === 429 || r.status >= 500) {
          throw Object.assign(new Error(`token refresh failed (${r.status})`), { status: r.status });
        }
        return r;
      },
      { label: "google.token" }
    );
  } catch (err) {
    console.error("[auth] Google token refresh unavailable:", err instanceof Error ? err.message : err);
    return null;
  }
  if (!res.ok) {
    console.error(`[auth] Google rejected the refresh token (${res.status}); user must sign in again`);
    return null;
  }
  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
    scope?: string;
    token_type?: string;
  };

  await prisma.account.update({
    where: { id: account.id },
    data: {
      access_token: data.access_token,
      expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
    },
  });
  return data.access_token;
}
