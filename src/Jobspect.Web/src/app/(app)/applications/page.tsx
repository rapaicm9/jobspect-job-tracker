import type { Metadata } from "next";

import {
  ApplicationCards,
  ApplicationsTable,
  listApplications,
  readViewPreferences,
  ViewPreferencesForm,
} from "@/features/applications";

export const metadata: Metadata = { title: "Applications — Jobspect" };

export default async function ApplicationsPage() {
  // The query calls requireSession itself, so the guard is inside the read
  // rather than beside it - a list that could be fetched without one would be a
  // list somebody could fetch without one.
  const [{ rows }, preferences] = await Promise.all([listApplications(), readViewPreferences()]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Applications</h1>
          {/* No count, here or anywhere. The API returns none by design, and a
              count of the rows that happen to be loaded reads as a total. */}
          <p className="text-sm text-muted-foreground">
            Every application you have recorded, newest first.
          </p>
        </div>

        {rows.length > 0 && <ViewPreferencesForm preferences={preferences} />}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center">
          <p className="font-medium text-foreground">No applications yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            The ones you record will appear here, with their stage, dates and source.
          </p>
        </div>
      ) : (
        <>
          <ApplicationsTable rows={rows} preferences={preferences} />
          <ApplicationCards rows={rows} preferences={preferences} />
        </>
      )}
    </div>
  );
}
