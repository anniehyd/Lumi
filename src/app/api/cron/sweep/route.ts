import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runSweep } from "@/lib/services/sweep";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Trigger an inbox sweep from an external scheduler (GitHub Actions, a Fly
 * scheduled machine, cron-job.org, …) instead of the worker's in-process timer.
 *
 *   curl -X POST https://<host>/api/cron/sweep \
 *     -H "authorization: Bearer $CRON_SECRET"
 *
 * In the default inline mode (see sweep.ts) the sweep does the ingest itself,
 * so this route is the whole backend: no worker machine and no Redis.
 *
 * The response is streamed. A sweep can run for minutes on a first backfill;
 * a heartbeat every few seconds keeps proxies from timing the request out and
 * keeps an auto-stopping machine awake until the work is done. The last line
 * is the JSON result.
 */
const HEARTBEAT_MS = 10_000;

function secretMatches(presented: string, secret: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

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
  if (!secretMatches(presented, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (text: string) => {
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          // The caller hung up; the sweep itself carries on.
        }
      };
      heartbeat = setInterval(() => write("\n"), HEARTBEAT_MS);
      runSweep()
        .then((result) => write(JSON.stringify({ ...result, ms: Date.now() - started }) + "\n"))
        .finally(() => {
          clearInterval(heartbeat);
          try {
            controller.close();
          } catch {
            // already closed
          }
        });
    },
    cancel() {
      clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
  });
}
