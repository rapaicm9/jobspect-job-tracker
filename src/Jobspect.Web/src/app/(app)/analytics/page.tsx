import type { Metadata } from "next";

import { requireSession } from "@/server/dal";

export const metadata: Metadata = { title: "Analytics — Jobspect" };

export default async function AnalyticsPage() {
  await requireSession();

  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Analytics</h1>
      <p className="text-sm text-muted-foreground">
        How the search is going: where applications stall, and how long each stage takes.
      </p>
    </div>
  );
}
