import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * Gate for data routes. In live mode (Google OAuth configured) the data is a
 * real inbox, so a signed-in session is required. Demo mode (no OAuth
 * configured) serves mock data and stays open — the public demo depends on it.
 */
export async function isAuthorizedViewer(): Promise<boolean> {
  if (!process.env.GOOGLE_CLIENT_ID) return true;
  const session = await getServerSession(authOptions);
  return Boolean(session?.user);
}
