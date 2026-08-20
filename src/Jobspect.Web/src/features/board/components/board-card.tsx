/// <reference types="react/canary" />

"use client";

// Client-owned because the card is the draggable. Still rendered on the server
// for the first paint - the data comes from the board's own read either way.
//
// `ViewTransition` is an experimental-channel React API, which this application
// is already on: Next opts the app directory into `react@experimental` whenever
// `taint` is set, and it has been since the access token was tainted. The types
// come from a triple-slash reference rather than an import, which must precede
// every statement in the file - `import {} from "react/canary"` typechecks and
// then fails Turbopack, the same wall the taint API hit.

import { useDraggable } from "@dnd-kit/react";
import { ViewTransition } from "react";
import { GripVertical } from "lucide-react";
import Link from "next/link";

import { formatDate } from "@/lib/dates";
import type { ActiveStage } from "@/lib/enums";
import { cn } from "@/lib/utils";

import type { BoardCard as Card } from "../board";

export interface BoardCardBodyProps {
  card: Card;
  href: string;
  /** The grip, when there is a live drag behind it. The overlay passes none. */
  handle?: React.ReactNode;
}

/**
 * The card's contents, with no drag in them.
 *
 * Split out so the overlay can render the same card while it travels: the
 * overlay is outside the list and must not call the draggable hook, which has no
 * effect there anyway.
 */
export function BoardCardBody({ card, href, handle }: BoardCardBodyProps) {
  const applied = formatDate(card.appliedDate);

  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {/* The role rather than the whole card, matching every other list in
              the product: one link per item, and the link text names where it
              goes. The grip beside it is what drags, so the two gestures never
              compete for the same press. */}
          <p className="font-medium text-foreground">
            <Link href={href} className="underline-offset-4 hover:underline">
              {card.role}
            </Link>
          </p>

          {card.companyName !== null && (
            <p className="mt-0.5 text-sm text-muted-foreground">{card.companyName}</p>
          )}
        </div>

        {handle}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {applied !== null && (
          <span>
            Applied <time dateTime={card.appliedDate}>{applied}</time>
          </span>
        )}

        {card.deadline !== null && (
          // The words carry it and the colour carries nothing: near and overdue
          // are told apart by what the chip says, not by what shade it is.
          <span
            className={cn(
              "inline-flex h-5 items-center rounded-4xl bg-muted px-2 font-medium whitespace-nowrap",
              card.deadline.overdue ? "text-foreground" : "text-muted-foreground",
            )}
          >
            <time dateTime={card.deadline.date}>{card.deadline.label}</time>
          </span>
        )}
      </div>
    </>
  );
}

export interface BoardCardProps {
  card: Card;
  href: string;
  /** The column this card is in, which is what a target checks against. */
  stage: ActiveStage;
}

export function BoardCard({ card, href, stage }: BoardCardProps) {
  // `type` is the whole of the client's move rule: a column accepts a set of
  // types, so a backward drop is never a drop rather than a refusal to explain.
  const { ref, handleRef } = useDraggable({ id: card.id, type: stage });

  return (
    // Named so a move between columns animates rather than jumping. Every card
    // carries one, not just the one being moved: React pairs the element before
    // an update with the element after it *by name*, so a name that only appears
    // once the move has started has nothing to pair with and silently does
    // nothing. Naming all of them also settles the cards that close the gap
    // behind one that left.
    //
    // `BoardCardBody` deliberately has none. It is rendered a second time inside
    // the drag overlay, and two elements sharing a name is the one thing a view
    // transition cannot have.
    <ViewTransition name={`card-${card.id}`}>
      {/* Nothing here changes while the card is being dragged, and that is not
          an omission. dnd-kit lifts this element itself and moves it under the
          pointer, so an `isDragging` treatment applies to the card in hand rather
          than to anything left behind - dimming it fades what the user is
          holding. */}
      <li ref={ref} className="rounded-lg border border-border bg-card p-3">
        <BoardCardBody
          card={card}
          href={href}
          handle={
            <button
              ref={handleRef}
              type="button"
              // The accessible name says which card, because a column of
              // identical "Move" buttons is not what a screen reader should hear.
              aria-label={`Move ${card.role}`}
              className="-mr-1 -mt-1 inline-flex size-(--control-height-sm) min-h-(--target-min) min-w-(--target-min) shrink-0 cursor-grab items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <GripVertical aria-hidden="true" className="size-4" />
            </button>
          }
        />
      </li>
    </ViewTransition>
  );
}
