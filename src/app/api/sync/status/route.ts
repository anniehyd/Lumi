import { NextResponse } from "next/server";
import { getViewer } from "@/lib/apiAuth";
import { getSyncStatus } from "@/lib/dataSource";

export const dynamic = "force-dynamic";

export async function GET() {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const status = await getSyncStatus(viewer);
  return NextResponse.json(status);
}
