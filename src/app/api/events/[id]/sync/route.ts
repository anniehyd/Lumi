import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { syncEventToCalendar, unsyncEvent } from "@/lib/services/calendar";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { id } = await params;
  const result = await syncEventToCalendar(session.user.id, id);
  if (!result) {
    return NextResponse.json(
      { error: "sync failed — check Google connection" },
      { status: 400 }
    );
  }
  return NextResponse.json(result);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { id } = await params;
  const ok = await unsyncEvent(session.user.id, id);
  return NextResponse.json({ ok });
}
