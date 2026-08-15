import type { Metadata } from "next";

import { AddApplicationButton } from "@/features/applications";
import { requireSession } from "@/server/dal";

export const metadata: Metadata = { title: "Board — Jobspect" };

// The columns and the drag arrive with the sprint that owns them. The session
// check is not a placeholder: the proxy's redirect is an optimisation that a
// request carrying any cookie gets past, so this is what actually guards the
// route.
//
// The add button is here already because it is a link and costs nothing, so the
// sprint that builds the board inherits it rather than having to remember. What
// waits for that sprint is an *empty state*, which needs a board that reads its
// own data to know whether there is anything in it.
export default async function BoardPage({ searchParams }: PageProps<"/board">) {
  await requireSession();

  const { campaignId } = await searchParams;
  const scope = typeof campaignId === "string" ? campaignId : null;

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Board</h1>
        <p className="text-sm text-muted-foreground">
          Your four active stages, side by side. Drag an application to move it along.
        </p>
      </div>

      <AddApplicationButton campaignId={scope} />
    </div>
  );
}
