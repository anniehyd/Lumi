import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * Who a data route is serving.
 *
 *   live mode (Google OAuth configured) — the data is a real inbox, so the
 *     viewer is the signed-in user and every query is scoped to their id.
 *   demo mode (no OAuth configured)     — there is nobody to sign in as; the
 *     viewer is the seeded demo user if one exists, otherwise mock data.
 */
export type Viewer = {
  /** Null only in demo mode with no seeded user: serve mocks. */
  userId: string | null;
  demo: boolean;
};

const DEMO_USER_EMAIL = process.env.LUMI_DEMO_USER_EMAIL || "yh5536@nyu.edu";

async function demoUserId(): Promise<string | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    const u = await prisma.user.findUnique({
      where: { email: DEMO_USER_EMAIL },
      select: { id: true },
    });
    return u?.id ?? null;
  } catch {
    return null;
  }
}

/** The viewer for this request, or null when the request must be rejected. */
export async function getViewer(): Promise<Viewer | null> {
  if (!process.env.GOOGLE_CLIENT_ID) return { userId: await demoUserId(), demo: true };
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  return { userId: session.user.id, demo: false };
}

/** @deprecated Use getViewer — a yes/no gate cannot scope a query to its user. */
export async function isAuthorizedViewer(): Promise<boolean> {
  return (await getViewer()) !== null;
}
