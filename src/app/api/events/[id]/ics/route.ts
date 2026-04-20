import { NextResponse } from "next/server";
import { getEvent } from "@/lib/dataSource";
import { buildSingleEvent } from "@/lib/ics";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const event = await getEvent(id);

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const body = buildSingleEvent(event);
  const safeTitle = event.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase();

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeTitle}.ics"`,
    },
  });
}
