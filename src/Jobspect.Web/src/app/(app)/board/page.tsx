import type { Metadata } from "next";

import { AddApplicationButton } from "@/features/applications";
import { BoardColumns, ClosedChip, isBoardEmpty, readBoard } from "@/features/board";
import { todayInZone } from "@/lib/instants";
import { getAccount, requireSession } from "@/server/dal";

export const metadata: Metadata = { title: "Board — Jobspect" };

export default async function BoardPage({ searchParams }: PageProps<"/board">) {
  // The session check is not a formality: the proxy's redirect is an optimisation
  // that a request carrying any cookie gets past, so this is what actually guards
  // the route.
  await requireSession();

  // Read straight rather than through a parser cache: one value, wanted by one
  // subtree, and threading it is cheaper than a cache nothing else reads.
  const { campaignId } = await searchParams;
  const scope = typeof campaignId === "string" ? campaignId : null;

  // Memoised by the shell layout, so this costs the page nothing. The zone is
  // what decides which day "today" is, and therefore whether a deadline is near.
  const account = await getAccount();
  const board = await readBoard({
    campaignId: scope,
    today: todayInZone(account?.timeZoneId ?? null),
  });

  const empty = isBoardEmpty(board);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Board</h1>
          <p className="text-sm text-muted-foreground">
            Your four active stages, side by side. Drag an application to move it along.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Present even on an empty board: it is the only route to the closed
              applications, and an account whose every application is closed has
              an empty board and somewhere to go. */}
          <ClosedChip closed={board.closed} campaignId={scope} />
          {!empty && <AddApplicationButton campaignId={scope} />}
        </div>
      </div>

      {empty ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center">
          <p className="font-medium text-foreground">
            {scope === null ? "No applications yet" : "Nothing in this campaign yet"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            The ones you record will appear here, in the stage they are sitting at.
          </p>
          <div className="mt-4 flex justify-center">
            <AddApplicationButton campaignId={scope} />
          </div>
        </div>
      ) : (
        <BoardColumns board={board} campaignId={scope} />
      )}
    </div>
  );
}
