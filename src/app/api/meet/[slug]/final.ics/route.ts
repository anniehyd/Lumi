import { NextResponse } from "next/server";
import { buildFinalIcs } from "@/lib/meetIcs";
import { meetStore } from "@/lib/meetStore";

export const dynamic = "force-dynamic";

/**
 * The picked time as a downloadable .ics. Anyone with the link may fetch it,
 * the same as the poll page itself; there is nothing in it the page does
 * not already show. 404 until the owner has picked a time.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const found = await meetStore().get(slug);
  if (!found) return NextResponse.json({ error: "not found" }, { status: 404 });

  const pollUrl = `${new URL(req.url).origin}/meet/${slug}`;
  const ics = buildFinalIcs(found.poll, pollUrl);
  if (!ics) return NextResponse.json({ error: "No time has been picked yet." }, { status: 404 });

  return new NextResponse(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
