"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          // Spent is local-only and same-origin, so react-query's online gating
          // adds nothing and can wrongly pause queries when a browser misreports
          // navigator.onLine. "always" keeps fetches running regardless.
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            networkMode: "always",
          },
          mutations: {
            networkMode: "always",
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
