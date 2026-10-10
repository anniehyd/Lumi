import { NextResponse } from "next/server";
import { runSweep } from "@/lib/services/sweep";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Trigger an inbox sweep from an external scheduler (Fly scheduled machine,
 * GitHub Actions, cron-job.org, …) instead of the worker's in-process timer.
 *
 *   curl -X POST https://lumi-live.fly.dev/api/cron/sweep \
 *     -H "authorization: Bearer $CRON_SECRET"
 *
 * Note this does NOT let you delete the worker machine — the worker is also the
 * BullMQ consumer for the ingest and reminder queues, and the jobs this route
 * enqueues still need something to run them. Dropping the always-on machine
 * means dropping BullMQ/Redis too; this route is the first half of that.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured; refusing to run an unauthenticated sweep" },
      { status: 503 }
    );
  }

  const auth = req.headers.get("authorization") ?? "";
  const presented = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (presented !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  await runSweep();
  return NextResponse.json({ ok: true, ms: Date.now() - started });
}
