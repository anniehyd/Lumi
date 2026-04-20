import { NextResponse } from "next/server";
import { getSyncStatus } from "@/lib/dataSource";

export const dynamic = "force-dynamic";

export async function GET() {
  const status = await getSyncStatus();
  return NextResponse.json(status);
}
