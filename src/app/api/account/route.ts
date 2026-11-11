import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Delete the signed-in user's account and everything stored under it.
 *
 * The User row's relations all cascade (accounts, sessions, emails, events,
 * metrics, sender history, miss reports), so one delete removes the lot;
 * scheduling polls they created stay up, ownerless, for the people who
 * answered them. Google's grant is revoked first, best effort: if Google is
 * unreachable the tokens are still destroyed with the row, and the user can
 * remove the leftover entry at myaccount.google.com/permissions.
 */
export async function DELETE() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
    select: { refresh_token: true, access_token: true },
  });
  const token = account?.refresh_token ?? account?.access_token;
  let revoked = false;
  if (token) {
    try {
      const res = await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token }),
        signal: AbortSignal.timeout(10_000),
      });
      revoked = res.ok;
    } catch {
      // Carry on: deleting the row below is what the user asked for.
    }
  }

  await prisma.user.delete({ where: { id: userId } });
  console.log(`[account] deleted user=${userId} googleRevoked=${revoked}`);
  return NextResponse.json({ ok: true, googleRevoked: revoked });
}
