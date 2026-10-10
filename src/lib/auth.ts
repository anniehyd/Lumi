import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/lib/db";
import { withRetry } from "@/lib/retry";

const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.events",
].join(" ");

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
      authorization: {
        params: {
          scope: GOOGLE_SCOPES,
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  session: { strategy: "database" },
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
  pages: {
    signIn: "/",
  },
};

/**
 * Fetch a user's Google access token, refreshing if expired.
 * Returns null if the user isn't connected or refresh fails.
 */
export async function getGoogleAccessToken(userId: string): Promise<string | null> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
  });
  if (!account) return null;

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
