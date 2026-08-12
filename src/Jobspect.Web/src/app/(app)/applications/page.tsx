import type { Metadata } from "next";

import {
  applicationsSearchParams,
  ApplicationsBrowser,
  listFirstPage,
  readViewPreferences,
  ViewPreferencesForm,
} from "@/features/applications";
import { STAGES } from "@/server/api/enums";

export const metadata: Metadata = { title: "Applications — Jobspect" };

export default async function ApplicationsPage({ searchParams }: PageProps<"/applications">) {
  // Parsed here and nowhere else: the cache is what lets a Server Component
  // below this one read the same filters without threading them through, and it
  // is only populated by this call.
  const filters = await applicationsSearchParams.parse(searchParams);

  const [initialPage, preferences] = await Promise.all([
    listFirstPage(filters),
    readViewPreferences(),
  ]);

  const empty = initialPage.rows.length === 0 && filters.stage.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Applications</h1>
          {/* No count, here or anywhere. The API returns none by design, and a
              count of the rows that happen to be loaded reads as a total. */}
          <p className="text-sm text-muted-foreground">Every application you have recorded.</p>
        </div>

        {!empty && <ViewPreferencesForm preferences={preferences} />}
      </div>

      {empty ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center">
          <p className="font-medium text-foreground">No applications yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            The ones you record will appear here, with their stage, dates and source.
          </p>
        </div>
      ) : (
        <ApplicationsBrowser
          filters={filters}
          preferences={preferences}
          // The union lives behind `server-only`, so the client is handed it
          // rather than importing it.
          stages={STAGES}
          initialPage={initialPage}
        />
      )}
    </div>
  );
}
