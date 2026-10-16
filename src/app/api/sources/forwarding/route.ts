import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, hasGoogleAccount } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  forwardingAddress,
  getOrCreateForwardingToken,
  inboundDomain,
  rotateForwardingToken,
} from "@/lib/forwardingToken";
import { parseGmailForwardingConfirmation } from "@/lib/services/inbound";

export const dynamic = "force-dynamic";

/**
 * The signed-in user's forwarding address.
 *
 * GET mints the token on first use and returns the address; POST rotates it
 * so mail to the old address is dropped. When the deployment has no inbound
 * domain the response says so and nothing is minted. The response also
 * carries the latest Gmail forwarding-confirmation code Lumi has received for
 * this user, so the Gmail filter setup can be finished from Settings.
 */
export type ForwardingStatus = {
  configured: boolean;
  address: string | null;
  gmailConnected: boolean;
  confirmation: { code: string | null; link: string | null; forwarder: string | null; receivedAt: string } | null;
  lastReceivedAt: string | null;
};

async function status(userId: string, token: string | null, domain: string | null): Promise<ForwardingStatus> {
  const [gmailConnected, confirmationMail, latest] = await Promise.all([
    hasGoogleAccount(userId),
    prisma.email.findFirst({
      where: { userId, skipReason: "forwarding_confirmation" },
      orderBy: { receivedAt: "desc" },
      select: { from: true, subject: true, bodyText: true, receivedAt: true },
    }),
    prisma.email.findFirst({
      where: { userId, gmailId: null },
      orderBy: { receivedAt: "desc" },
      select: { receivedAt: true },
    }),
  ]);
  const confirmation = confirmationMail
    ? parseGmailForwardingConfirmation({ ...confirmationMail, bodyText: confirmationMail.bodyText ?? "" })
    : null;
  return {
    configured: !!domain,
    address: token && domain ? forwardingAddress(token, domain) : null,
    gmailConnected,
    confirmation: confirmation ? { ...confirmation, receivedAt: confirmationMail!.receivedAt.toISOString() } : null,
    lastReceivedAt: latest?.receivedAt.toISOString() ?? null,
  };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const domain = inboundDomain();
  const token = domain ? await getOrCreateForwardingToken(userId) : null;
  return NextResponse.json(await status(userId, token, domain));
}

export async function POST() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const domain = inboundDomain();
  if (!domain) {
    return NextResponse.json({ error: "forwarding is not configured on this deployment" }, { status: 409 });
  }
  const token = await rotateForwardingToken(userId);
  return NextResponse.json({ ...(await status(userId, token, domain)), rotated: true });
}
