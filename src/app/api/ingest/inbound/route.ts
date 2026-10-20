import { NextResponse } from "next/server";
import { inboundDomain, resolveForwardingUserFromAddresses } from "@/lib/forwardingToken";
import { ingestInbound } from "@/lib/services/ingest";
import {
  checkInboundSecret,
  parseGmailForwardingConfirmation,
  parsePostmarkInbound,
  presentedSecret,
  recipientCandidates,
  unwrapForwarded,
  type PostmarkInbound,
} from "@/lib/services/inbound";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Postmark inbound webhook: one POST per email sent to
 * lumi+<token>@INBOUND_EMAIL_DOMAIN. The token names the user; the message
 * then takes exactly the path a Gmail message takes (store, detect, metrics).
 *
 * Postmark retries on any non-2xx for up to ten attempts, so a request that
 * is well-formed but unusable (unknown token, duplicate) is acknowledged with
 * 200 and a `skipped` reason rather than answered with an error forever. Only
 * a wrong secret or a body that is not JSON is refused.
 *
 * Size: Postmark caps inbound messages at 35 MB; Next's default body limit is
 * well above that for route handlers, so no special handling here.
 */
export async function POST(req: Request) {
  const check = checkInboundSecret(presentedSecret(req));
  if (check === "unconfigured") {
    return NextResponse.json(
      { error: "INBOUND_WEBHOOK_SECRET is not configured; refusing unauthenticated inbound mail" },
      { status: 503 }
    );
  }
  if (check !== "ok") return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const payload = (await req.json().catch(() => null)) as PostmarkInbound | null;
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "body must be Postmark inbound JSON" }, { status: 400 });
  }

  let parsed;
  try {
    parsed = await parsePostmarkInbound(payload);
  } catch (err) {
    // A message mailparser cannot read is not going to parse on retry either.
    console.error("[inbound] could not parse message:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: true, skipped: "unparseable" });
  }

  const resolved = await resolveForwardingUserFromAddresses(
    recipientCandidates(payload, parsed),
    inboundDomain()
  );
  if (!resolved) {
    console.warn("[inbound] no user for recipients", recipientCandidates(payload, parsed).slice(0, 3));
    return NextResponse.json({ ok: true, skipped: "unknown-recipient" });
  }

  // Gmail's "please confirm forwarding" mail is stored (Settings reads the code
  // out of it) but never sent to detection — there is no event in it.
  const confirmation = parseGmailForwardingConfirmation(parsed);
  const result = confirmation
    ? await ingestInbound(resolved.userId, parsed, { detect: false, skipReason: "forwarding_confirmation" })
    : await ingestInbound(resolved.userId, unwrapForwarded(parsed));

  if (!result.stored) return NextResponse.json({ ok: true, skipped: "duplicate" });
  return NextResponse.json({
    ok: true,
    emailId: result.emailId,
    eventsCreated: result.eventsCreated,
    skipped: result.skipped,
    failed: result.failed,
    ...(confirmation ? { forwardingConfirmation: true } : {}),
  });
}
