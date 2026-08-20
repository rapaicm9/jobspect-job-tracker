import "server-only";

import {
  DEFAULT_FILTERS,
  listApplications,
  MAX_PAGE_SIZE,
  type ApplicationPage,
} from "@/features/applications";
import { ACTIVE_STAGES, TERMINAL_STAGES, type ActiveStage } from "@/lib/enums";

import { toBoardCard, type Board, type BoardColumn, type ClosedCount } from "../board";

/**
 * Five reads, one per column plus the closed count, issued together.
 *
 * Four filtered reads rather than one walk of the whole list, because a walk
 * fills unevenly: a hundred rows can come back ninety-five Applied and no Offer,
 * and until the walk ended the Offer column would be showing an empty state that
 * is not true. One request per column costs four round trips and is never wrong
 * about a column it has read.
 *
 * The order is the API's default - applied date, newest first. The list's sort
 * lives in the URL and is deliberately not read here: per-column sort is not a
 * thing this board offers, and inheriting a sort from a screen the user was
 * looking at earlier would reorder a board they never asked to reorder.
 */
function readStages(stages: string[], campaignId: string | null): Promise<ApplicationPage> {
  return listApplications({
    filters: { ...DEFAULT_FILTERS, stage: stages, campaignId },
    limit: MAX_PAGE_SIZE,
  });
}

async function readColumn(
  stage: ActiveStage,
  campaignId: string | null,
  today: string,
): Promise<BoardColumn> {
  const page = await readStages([stage], campaignId);

  // `reset` cannot happen here - it answers a cursor that no longer describes the
  // list, and this read sends none - so both failures mean the same thing to a
  // column: it has nothing to show and has to say so.
  if (page.kind !== "page") return { kind: "failed", stage };

  return {
    kind: "loaded",
    stage,
    cards: page.rows.map((row) => toBoardCard(row, today)),
    // Non-null means the stage holds more than one page. There is no second read:
    // a board is a snapshot of what is in play, so the column says so and points
    // at the list rather than growing a walk of its own.
    truncated: page.nextCursor !== null,
  };
}

/**
 * How many applications are closed, as closely as this API can answer.
 *
 * There are no totals on the list endpoint (backend ADR 0008), so the count is
 * the length of one bounded read: exact up to the ceiling and "100+" above it.
 * The alternative - the analytics overview, which does return exact counts - is a
 * projection built from events, so after a close-out it would disagree with the
 * columns beside it until the outbox caught up. See ADR 0001.
 */
async function readClosed(campaignId: string | null): Promise<ClosedCount> {
  const page = await readStages([...TERMINAL_STAGES], campaignId);
  if (page.kind !== "page") return { kind: "failed" };

  return { kind: "counted", count: page.rows.length, atLeast: page.nextCursor !== null };
}

export interface ReadBoardOptions {
  campaignId: string | null;
  /**
   * The account's own calendar day, which is what decides whether a deadline is
   * near. Passed in rather than read here so that one board is judged against one
   * instant, and so the value the server rendered is the value commit 3's client
   * card keeps holding.
   */
  today: string;
}

export async function readBoard({ campaignId, today }: ReadBoardOptions): Promise<Board> {
  const [columns, closed] = await Promise.all([
    Promise.all(ACTIVE_STAGES.map((stage) => readColumn(stage, campaignId, today))),
    readClosed(campaignId),
  ]);

  return { columns, closed };
}
