import { NextResponse } from "next/server";
import { listEvents } from "@/lib/dataSource";
import { buildCalendar } from "@/lib/ics";

export const dynamic = "force-dynamic";

export async function GET() {
  const [accepted, maybe] = await Promise.all([
    listEvents({ status: "ACCEPTED" }),
    listEvents({ status: "MAYBE" }),
  ]);
  const body = buildCalendar([...accepted, ...maybe], "Lumi");

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="lumi.ics"',
      "Cache-Control": "public, max-age=300",
    },
  });
}
