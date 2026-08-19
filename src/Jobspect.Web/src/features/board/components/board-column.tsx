"use client";

// Client-owned because the column is the drop target.

import { useDroppable } from "@dnd-kit/react";
import Link from "next/link";

import { withCampaignScope } from "@/features/campaigns";
import { cn } from "@/lib/utils";

import type { BoardColumn as Column } from "../board";
import { stagesAcceptedBy } from "../drag";
import { stageListHref } from "../links";

import { BoardCard } from "./board-card";

export interface BoardColumnProps {
  column: Column;
  campaignId: string | null;
}

/**
 * One stage, and everything the client can honestly say about it.
 *
 * The heading carries the stage and a number, and the number is what the column
 * is *showing* rather than what the stage holds - the API returns no totals, so a
 * total is not a figure this client has. That distinction is why a truncated
 * column has a line under it saying so, and why the count is read out to a screen
 * reader with the same qualification the eye gets.
 */
export function BoardColumn({ column, campaignId }: BoardColumnProps) {
  const headingId = `board-column-${column.stage.toLowerCase()}`;

  const { ref, isDropTarget } = useDroppable({
    id: column.stage,
    accept: stagesAcceptedBy(column.stage),
    // A column whose read failed could not show the result of a move into it, so
    // it does not offer to receive one.
    disabled: column.kind === "failed",
  });

  return (
    <section
      ref={ref}
      aria-labelledby={headingId}
      className={cn(
        "flex w-72 shrink-0 flex-col gap-3 rounded-lg border border-transparent p-1 lg:w-auto lg:shrink",
        // Shown on the columns that can take the card in hand, so which drops are
        // available is legible before the drop rather than after it.
        isDropTarget && "border-dashed border-border-strong bg-accent/40",
      )}
    >
      <div className="flex items-baseline justify-between gap-2 border-b border-border pb-2">
        <h2 id={headingId} className="text-sm font-semibold tracking-tight text-foreground">
          {column.stage}
        </h2>

        {column.kind === "loaded" && (
          <p className="text-xs text-muted-foreground tabular-nums">
            {column.cards.length}
            <span className="sr-only">
              {column.truncated ? " shown, more not loaded" : " applications"}
            </span>
          </p>
        )}
      </div>

      {column.kind === "failed" ? (
        // One column, not the page. The other three are still the answer to what
        // the reader came for, and blanking the board to report one outage would
        // take away the ones that work.
        <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
          {column.stage} could not be loaded.
        </p>
      ) : column.cards.length === 0 ? (
        // One line, not an illustration. A job search legitimately has nothing in
        // Offer, and dressing that up as an event would be wrong about it.
        <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
          Nothing in this stage.
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {column.cards.map((card) => (
              <BoardCard
                key={card.id}
                card={card}
                stage={column.stage}
                href={withCampaignScope(`/applications/${card.id}`, campaignId)}
              />
            ))}
          </ul>

          {column.truncated && (
            // Silent truncation is the one failure on a board that nobody can
            // detect by looking. The list is where the rest of them are: it walks
            // a set that size, and it sorts and filters one, which is the whole
            // reason the board hands off rather than growing a walk of its own.
            <p className="text-xs text-muted-foreground">
              Showing the first {column.cards.length}. More are not loaded —{" "}
              <Link
                href={stageListHref(column.stage, campaignId)}
                className="font-medium text-foreground underline underline-offset-4"
              >
                see every {column.stage} application
              </Link>
              .
            </p>
          )}
        </>
      )}
    </section>
  );
}
