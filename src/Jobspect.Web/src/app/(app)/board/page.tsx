import type { Metadata } from "next";

import { requireSession } from "@/server/dal";

export const metadata: Metadata = { title: "Board — Jobspect" };

// The columns and the drag arrive with the sprint that owns them. The session
// check is not a placeholder: the proxy's redirect is an optimisation that a
// request carrying any cookie gets past, so this is what actually guards the
// route.
export default async function BoardPage() {
  await requireSession();

  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Board</h1>
      <p className="text-sm text-muted-foreground">
        Your four active stages, side by side. Drag an application to move it along.
      </p>
    </div>
  );
}
