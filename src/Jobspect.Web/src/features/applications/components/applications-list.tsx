"use client";

// The list owns client state for one reason §5 names: pages 2..n arrive after
// the render that produced page 1, and a keyset walk has to accumulate.

import { useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/ui/button";

import { fetchApplicationsPage } from "../actions/fetch-applications-page";
import { CursorResetError } from "../cursor-reset";
import { applicationsQueryKey, type ApplicationFilters } from "../filters";
import type { ApplicationRow } from "../to-application-row";
import type { ViewPreferences } from "../view-preferences";

import { ApplicationCards } from "./application-cards";
import { ApplicationsTable } from "./applications-table";

interface Page {
  rows: ApplicationRow[];
  nextCursor: string | null;
}

export interface ApplicationsListProps {
  filters: ApplicationFilters;
  preferences: ViewPreferences;
  /** Page one, rendered by the server. Seeds the cache rather than refetching. */
  initialPage: Page;
}

export function ApplicationsList({ filters, preferences, initialPage }: ApplicationsListProps) {
  const queryClient = useQueryClient();
  const queryKey = applicationsQueryKey(filters);

  const { data, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam }) => {
      const result = await fetchApplicationsPage({ filters, cursor: pageParam });

      // Thrown here rather than returned, so that TanStack treats it as a failed
      // fetch and the effect below can recognise it. On the server it was a
      // value, because a class does not survive an action.
      if (result.kind === "reset") throw new CursorResetError();
      if (result.kind === "failed") throw new Error("The next page could not be read.");

      return { rows: result.rows, nextCursor: result.nextCursor };
    },
    // The cursor is a position in a walk rather than a page number, so the first
    // request carries none at all.
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage: Page) => lastPage.nextCursor ?? undefined,
    // What the server already rendered. Keyed by the same filters, so changing
    // one starts a new walk with its own server-rendered first page rather than
    // seeding the new key from the old one.
    initialData: { pages: [initialPage], pageParams: [null] },
    // A stale cursor is not worth retrying: the answer is a new walk, and the
    // effect below starts one.
    retry: false,
  });

  useEffect(() => {
    if (!(error instanceof CursorResetError)) return;

    // Drop every page and walk again from the top. The user sees the list
    // refresh; nothing tells them about a cursor, which is not a thing they have
    // one of.
    void queryClient.resetQueries({ queryKey });
  }, [error, queryClient, queryKey]);

  /**
   * Takes a deleted row out of the walk.
   *
   * The action revalidating `/applications` cannot do this. The pages here were
   * seeded once from the server's first page and accumulated by the browser
   * after it; a query already holding data ignores a fresh `initialData`, so a
   * re-render leaves the deleted row exactly where it was. Whoever owns the
   * cache repairs the cache.
   *
   * The row is dropped rather than the walk restarted. A reset would refetch
   * every page the reader has loaded and scroll them back to the top, which is a
   * heavy answer to one row going - and the cursors stay valid, because a keyset
   * walk is positioned by the last row it returned rather than by an offset that
   * a delete would shift.
   */
  const removeRow = (id: string) => {
    queryClient.setQueryData<InfiniteData<Page, string | null>>(queryKey, (current) =>
      current === undefined
        ? current
        : {
            ...current,
            pages: current.pages.map((page) => ({
              ...page,
              rows: page.rows.filter((row) => row.id !== id),
            })),
          },
    );
  };

  const rows = data.pages.flatMap((page) => page.rows);

  if (rows.length === 0) {
    // Distinct from the empty account, which the page renders instead of this
    // whole component. Nothing is wrong here - the filters just do not match
    // anything - and the bar above stays on screen so it can be undone.
    return (
      <p className="rounded-lg border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
        No applications match these filters.
      </p>
    );
  }

  return (
    <>
      <ApplicationsTable rows={rows} preferences={preferences} onDeleted={removeRow} />
      <ApplicationCards rows={rows} preferences={preferences} onDeleted={removeRow} />

      <LoadMore
        // Remounted when the filters change, which is what gives a new walk its
        // own automatic first step. Holding that in state and clearing it from
        // an effect would be the same thing with a render in between.
        key={JSON.stringify(queryKey)}
        hasNextPage={hasNextPage}
        isFetching={isFetchingNextPage}
        onLoadMore={() => void fetchNextPage()}
      />
    </>
  );
}

interface LoadMoreProps {
  hasNextPage: boolean;
  isFetching: boolean;
  onLoadMore: () => void;
}

/**
 * Page two arrives on its own; every page after it waits to be asked for.
 *
 * Keyset paging is forward-only and there is no total, so a footer that never
 * arrives is worse than a button - but making somebody click for the second
 * screenful of a list they have just opened is worse again. One automatic page
 * covers the common case and the button keeps the long case controllable.
 *
 * The automatic step is spent **once per walk**, tracked here rather than
 * inferred from how many pages are loaded. Those two are not the same thing: a
 * stale cursor resets the list back to one page while the reader is still at the
 * bottom of it, and a count-based rule reads that as "first time at the end" and
 * immediately fetches again - so a reset nobody asked for turns into another
 * request, and the reset itself is never visible. Spending it once means the
 * button is what appears instead, which is also the honest offer: the list moved
 * under them, and going further is now their call.
 *
 * No count on the button, for the same reason there is none anywhere else: the
 * only number available is how many rows happen to be loaded, and that reads as
 * a total.
 */
function LoadMore({ hasNextPage, isFetching, onLoadMore }: LoadMoreProps) {
  const sentinel = useRef<HTMLDivElement>(null);
  const [autoLoadSpent, setAutoLoadSpent] = useState(false);

  useEffect(() => {
    if (autoLoadSpent || !hasNextPage || isFetching) return;

    const target = sentinel.current;
    if (target === null) return;

    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;

      setAutoLoadSpent(true);
      onLoadMore();
    });

    observer.observe(target);
    return () => {
      observer.disconnect();
    };
  }, [autoLoadSpent, hasNextPage, isFetching, onLoadMore]);

  if (!hasNextPage) return null;

  return (
    <div ref={sentinel} className="flex justify-center py-4">
      {autoLoadSpent && (
        <Button type="button" variant="outline" onClick={onLoadMore} disabled={isFetching}>
          {isFetching ? "Loading…" : "Load more"}
        </Button>
      )}
    </div>
  );
}
