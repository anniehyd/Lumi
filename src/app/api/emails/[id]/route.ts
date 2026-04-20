import { NextResponse } from "next/server";
import { getEmail } from "@/lib/dataSource";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const email = await getEmail(id);
  if (!email) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ email });
}
