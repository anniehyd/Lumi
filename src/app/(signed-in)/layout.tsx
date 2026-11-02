import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Everything in this group is a signed-in surface. On a live deployment
 * (Google OAuth configured) a visitor without a session is sent back to the
 * front door instead of seeing an empty dashboard labelled "demo"; the data
 * routes behind these pages already answer 401, so this only fixes what the
 * page looks like. In demo mode there is nobody to sign in as and every page
 * serves the sample inbox, so the gate stays open.
 */
export default async function SignedInLayout({ children }: { children: React.ReactNode }) {
  if (process.env.GOOGLE_CLIENT_ID) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) redirect("/");
  }
  return <>{children}</>;
}
