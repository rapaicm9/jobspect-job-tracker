import Link from "next/link";

import type { ClosedCount } from "../board";
import { closedListHref } from "../links";

export interface ClosedChipProps {
  closed: ClosedCount;
  campaignId: string | null;
}

/**
 * The applications the board holds no column for.
 *
 * ADR 0001 keeps the four terminal outcomes off the board and puts them behind a
 * filter on the list, which makes this link the only route to them - so it
 * renders even when the count could not be read. What it does not do then is
 * claim a number: a figure nobody could read is not a figure to put on a screen.
 *
 * "100+" above the ceiling for the same reason. The count is the length of one
 * bounded read, and it is exact right up until it isn't.
 */
export function ClosedChip({ closed, campaignId }: ClosedChipProps) {
  const label =
    closed.kind === "failed"
      ? "Closed applications"
      : `${String(closed.count)}${closed.atLeast ? "+" : ""} closed`;

  return (
    <Link
      href={closedListHref(campaignId)}
      className="inline-flex h-8 items-center rounded-4xl border border-border px-3 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
    >
      {label}
    </Link>
  );
}
