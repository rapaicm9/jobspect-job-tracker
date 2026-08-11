"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { useState } from "react";

import type { ApplicationFilters } from "../filters";
import type { ApplicationRow } from "../to-application-row";
import type { ViewPreferences } from "../view-preferences";

import { ApplicationsList } from "./applications-list";
import { FilterBar } from "./filter-bar";

export interface ApplicationsBrowserProps {
  filters: ApplicationFilters;
  preferences: ViewPreferences;
  stages: readonly string[];
  initialPage: { rows: ApplicationRow[]; nextCursor: string | null };
}

/**
 * Both providers, scoped to the one screen that needs them.
 *
 * §5 permits TanStack Query in three places and this is the first; a provider in
 * the shell would make a fourth use the path of least resistance. nuqs needs its
 * own adapter above any `useQueryState` - the library's guidance puts it in the
 * root layout, and it sits here for the same reason the Query one does.
 */
export function ApplicationsBrowser({
  filters,
  preferences,
  stages,
  initialPage,
}: ApplicationsBrowserProps) {
  // Created once per mount rather than at module scope, which on the server
  // would be one cache shared by every request and therefore by every account.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // The server rendered this page a moment ago. Refetching it on mount
            // would ask the API for what is already on the screen.
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <NuqsAdapter>
      <QueryClientProvider client={queryClient}>
        <FilterBar stages={stages} />
        <ApplicationsList filters={filters} preferences={preferences} initialPage={initialPage} />
      </QueryClientProvider>
    </NuqsAdapter>
  );
}
