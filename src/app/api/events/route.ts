import { NextResponse } from "next/server";
import { isAuthorizedViewer } from "@/lib/apiAuth";
import { listEvents } from "@/lib/dataSource";
import type { MockEvent } from "@/lib/mock/events";

export const dynamic = "force-dynamic";

const validStatuses: MockEvent["status"][] = [
  "PENDING",
  "ACCEPTED",
  "MAYBE",
  "DECLINED",
];

export async function GET(req: Request) {
  if (!(await isAuthorizedViewer())) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const statusParam = searchParams.get("status");
  const limit = Number(searchParams.get("limit") ?? "100");

  const status =
    statusParam && validStatuses.includes(statusParam as MockEvent["status"])
      ? (statusParam as MockEvent["status"])
      : undefined;

  const events = await listEvents({ status, limit });
  return NextResponse.json({ events });
}
