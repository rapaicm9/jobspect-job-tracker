import type { Metadata } from "next";

import { requireSession } from "@/server/dal";

export const metadata: Metadata = { title: "Applications — Jobspect" };

// The dense table and everything around it arrive with the next commit. The
// shell now carries the account and the sign-out, so what is left here is the
// screen itself.
export default async function ApplicationsPage() {
  await requireSession();

  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Applications</h1>
      <p className="text-sm text-muted-foreground">
        Every application you have recorded, with its stage, dates and source.
      </p>
    </div>
  );
}
