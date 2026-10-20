"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";

/**
 * Sends a signed-in user through onboarding exactly once.
 *
 * The flag lives in the database (User.onboardedAt), not the session, so it
 * survives new devices and sign-outs — and re-saving the profile from Settings
 * never re-triggers the flow.
 *
 * Mounted globally in Providers. It renders nothing and is inert on the public
 * landing page and on /onboarding itself.
 */
const EXEMPT = ["/", "/onboarding"];

export function OnboardingGate() {
  const { status } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  const authed = status === "authenticated";
  const exempt = EXEMPT.includes(pathname);

  const { data } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const res = await fetch("/api/profile");
      if (!res.ok) throw new Error("failed");
      return (await res.json()) as { onboarded: boolean };
    },
    enabled: authed && !exempt,
    staleTime: Infinity,
    retry: false,
  });

  useEffect(() => {
    if (authed && !exempt && data && !data.onboarded) {
      router.replace("/onboarding");
    }
  }, [authed, exempt, data, router]);

  return null;
}
