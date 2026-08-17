"use client";

// The second of §5's three permitted uses of TanStack Query: an infinite cursor
// list. The timeline is the one list in the product that genuinely grows at the
// head while it is being read, which is the case ADR 0008 cites for keyset.

import { useInfiniteQuery } from "@tanstack/react-query";

import { Button } from "@/ui/button";

import { fetchActivityPage } from "../actions/fetch-activity-page";
import { activityQueryKey, type TimelinePage } from "../activity-reading";

import { ActivityEntryRow } from "./activity-entry-row";
import { DetailPanel, PanelNote, PanelUnavailable } from "./detail-panel";
import { NoteComposer } from "./note-composer";

export interface ActivityTimelineProps {
  applicationId: string;
  timeZoneId: string | null;
  /** Page one, rendered by the server. Absent when that read failed. */
  initialPage: TimelinePage | null;
}

export function ActivityTimeline({
  applicationId,
  timeZoneId,
  initialPage,
}: ActivityTimelineProps) {
  // The cache lives in `DetailQueryProvider`, above the whole screen, because the
  // transition menu up in the header has to be able to invalidate this walk: a
  // move writes a stage-change entry that only a refetch can show.
  return (
    <DetailPanel title="Activity">
      <div className="flex flex-col gap-6">
        <NoteComposer applicationId={applicationId} />

        {initialPage === null ? (
          <PanelUnavailable subject="This application's history" />
        ) : (
          <Feed applicationId={applicationId} timeZoneId={timeZoneId} initialPage={initialPage} />
        )}
      </div>
    </DetailPanel>
  );
}

interface FeedProps {
  applicationId: string;
  timeZoneId: string | null;
  initialPage: TimelinePage;
}

function Feed({ applicationId, timeZoneId, initialPage }: FeedProps) {
  const { data, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: activityQueryKey(applicationId),
    queryFn: async ({ pageParam }) => {
      const result = await fetchActivityPage({ applicationId, cursor: pageParam });

      // There is no reset case to tell apart here, unlike the list: the timeline
      // has one order and no filters, so nothing can move under a walk and the
      // endpoint never answers `cursor.sort_mismatch`.
      if (result.kind === "failed") throw new Error("The next page could not be read.");

      return result.page;
    },
    // The cursor is a position in a walk rather than a page number, so the first
    // request carries none at all.
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage: TimelinePage) => lastPage.nextCursor ?? undefined,
    initialData: { pages: [initialPage], pageParams: [null] },
    retry: false,
  });

  const entries = data.pages.flatMap((page) => page.entries);

  if (entries.length === 0) {
    // Only reachable for an application created before the timeline existed: the
    // API writes a Created entry with every application.
    return <PanelNote>Nothing recorded yet.</PanelNote>;
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Named, like the list's table and cards are. The composer sits in the
          same panel, so without this the history has no boundary of its own -
          for a screen reader moving by landmark, or for an assertion. */}
      <ul aria-label="Activity" className="flex flex-col">
        {entries.map((entry) => (
          <ActivityEntryRow key={entry.id} entry={entry} timeZoneId={timeZoneId} />
        ))}
      </ul>

      {error !== null && (
        <PanelNote>The rest of the history could not be read. Try again.</PanelNote>
      )}

      {hasNextPage && (
        // A plain button, and deliberately not the list's `LoadMore`. That
        // component's automatic first step exists because somebody who opens a
        // list is already scrolling one; this sits under the facts on a page
        // whose reader has chosen to look at it.
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={() => void fetchNextPage()}
          disabled={isFetchingNextPage}
        >
          {isFetchingNextPage ? "Loading…" : "Load more"}
        </Button>
      )}
    </div>
  );
}
