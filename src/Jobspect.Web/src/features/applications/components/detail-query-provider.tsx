"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

/**
 * One cache for the detail screen, above everything on it.
 *
 * It takes `children`, so every server-rendered region on this page passes
 * straight through and stays a Server Component. What it buys is that the
 * transition menu, which sits in the header, can invalidate the timeline's walk
 * further down: a move writes a stage-change entry the timeline's cache cannot
 * know about, and the header and the history have to move together or the screen
 * contradicts itself.
 *
 * §5 permits TanStack Query in three places, and both uses on this screen are
 * the same one - the infinite cursor list. A provider at the top of a screen is
 * exactly what makes a fourth use the easiest thing to write, so the rule is
 * worth restating here rather than only in the document.
 */
export function DetailQueryProvider({ children }: { children: React.ReactNode }) {
  // Created once per mount rather than at module scope, which on the server would
  // be one cache shared by every request and therefore by every account.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // The server rendered this a moment ago. Refetching on mount would ask
            // the API for what is already on the screen.
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
