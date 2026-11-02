import { Landing } from "@/components/Landing";

export const dynamic = "force-dynamic";

/**
 * The front door, rendered on the server so the demo links can come from the
 * environment: LUMI_DEMO_URL is the origin of a demo deployment (no trailing
 * slash). Unset, the links stay on this host, which is right for local dev
 * and for the demo deployment itself.
 */
export default function Page() {
  const demoBase = (process.env.LUMI_DEMO_URL ?? "").trim().replace(/\/+$/, "");
  return <Landing demoBase={demoBase} />;
}
