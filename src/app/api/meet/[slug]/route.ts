import { NextResponse } from "next/server";
import { getViewer } from "@/lib/apiAuth";
import { bestTimes } from "@/lib/meet";
import { meetStore } from "@/lib/meetStore";

export const dynamic = "force-dynamic";

/**
 * Everything the poll page needs in one call: the grid definition, every
 * answer, the ranked common times, and whether this viewer may pick the
 * final time. Edit tokens never leave the server.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const found = await meetStore().get(slug);
  if (!found) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Anyone with the link may answer; signing in is not required.
  const viewer = await getViewer();
  const viewerIsOwner = Boolean(
    viewer && (viewer.demo || (viewer.userId && viewer.userId === found.poll.ownerId))
  );

  return NextResponse.json({
    poll: found.poll,
    responses: found.responses,
    best: bestTimes(found.poll, found.responses, { limit: 6 }),
    viewerIsOwner,
  });
}
