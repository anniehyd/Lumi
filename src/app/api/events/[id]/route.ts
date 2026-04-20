import { NextResponse } from "next/server";
import { getEvent, updateEventStatus } from "@/lib/dataSource";
import type { MockEvent } from "@/lib/mock/events";

export const dynamic = "force-dynamic";

const validStatuses: MockEvent["status"][] = [
  "PENDING",
  "ACCEPTED",
  "MAYBE",
  "DECLINED",
];

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const event = await getEvent(id);
  if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ event });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const status = body.status as MockEvent["status"] | undefined;

  if (!status || !validStatuses.includes(status)) {
    return NextResponse.json(
      { error: "status must be one of " + validStatuses.join(", ") },
      { status: 400 }
    );
  }

  const event = await updateEventStatus(id, status);
  if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ event });
}
