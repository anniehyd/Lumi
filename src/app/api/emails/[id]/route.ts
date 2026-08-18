import { NextResponse } from "next/server";
import { isAuthorizedViewer } from "@/lib/apiAuth";
import { getEmail } from "@/lib/dataSource";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthorizedViewer())) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { id } = await params;
  const email = await getEmail(id);
  if (!email) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ email });
}
