import { NextResponse } from "next/server";
import { isAuthorizedViewer } from "@/lib/apiAuth";
import { getSyncStatus } from "@/lib/dataSource";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAuthorizedViewer())) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const status = await getSyncStatus();
  return NextResponse.json(status);
}
