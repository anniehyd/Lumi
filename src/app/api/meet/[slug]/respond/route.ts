import { NextResponse } from "next/server";
import { meetStore } from "@/lib/meetStore";

export const dynamic = "force-dynamic";

/**
 * Save one person's availability. No account: the first save under a name
 * returns an edit token, and later saves under that name must present it.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    name?: unknown;
    slots?: unknown;
    editToken?: unknown;
  };
  const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
  if (!name) return NextResponse.json({ error: "Tell the others who you are." }, { status: 400 });
  if (name.length > 40) return NextResponse.json({ error: "Keep your name under 40 characters." }, { status: 400 });

  const result = await meetStore().respond(slug, {
    name,
    slots: Array.isArray(body.slots) ? body.slots : [],
    editToken: typeof body.editToken === "string" ? body.editToken : null,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ editToken: result.editToken, name });
}
