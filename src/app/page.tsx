import { Landing } from "@/components/Landing";

export const dynamic = "force-dynamic";

/**
 * The front door, rendered on the server so the demo links can come from the
 * environment: LUMI_DEMO_URL is the origin of a demo deployment (no trailing
 * slash). Unset, the links stay on this host, which is right for local dev
 * and for the demo deployment itself.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const demoBase = (process.env.LUMI_DEMO_URL ?? "").trim().replace(/\/+$/, "");
  // Two reasons someone lands here with a message waiting: sign-in turned
  // them away because every place is taken (src/lib/auth.ts), or they just
  // deleted their account.
  const params = await searchParams;
  const notice = params.full ? "full" : params.deleted ? "deleted" : null;
  return <Landing demoBase={demoBase} notice={notice} />;
}
