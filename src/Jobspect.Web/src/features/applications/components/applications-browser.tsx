"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
 * The Query provider, scoped to the one screen that needs it.
 *
 * §5 permits TanStack Query in three places and this is the first; a provider in
 * the shell would make a fourth use the path of least resistance. nuqs's adapter
 * used to sit here too and now lives in the shell layout, because the campaign
 * switcher writes URL state from the header and a provider cannot be below its
 * consumer.
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
    <QueryClientProvider client={queryClient}>
      <FilterBar stages={stages} />
      <ApplicationsList filters={filters} preferences={preferences} initialPage={initialPage} />
    </QueryClientProvider>
  );
}
