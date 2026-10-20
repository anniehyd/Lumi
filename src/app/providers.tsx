"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import { useState } from "react";
import { OnboardingGate } from "@/components/OnboardingGate";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient());
  return (
    <SessionProvider>
      <QueryClientProvider client={client}>
        <OnboardingGate />
        {children}
      </QueryClientProvider>
    </SessionProvider>
  );
}
