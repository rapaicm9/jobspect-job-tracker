"use client";

// Client-owned because it is a drop target, and because whether a drag is live is
// state only the browser has.

import { useDragOperation, useDroppable } from "@dnd-kit/react";

import { ACTIVE_STAGES } from "@/lib/enums";
import { cn } from "@/lib/utils";

import { CLOSE_OUT_TARGET } from "../drag";

/**
 * The second drop target, and it exists only while a card is in hand.
 *
 * Closing an application is a different kind of transition from advancing one,
 * so it gets a different gesture rather than four more columns - putting
 * Accepted, Rejected, Withdrawn and Ghosted along an axis that means order would
 * assert a sequence among them that does not exist (ADR 0001). One target at the
 * end of the pipeline asserts no such thing: it is where an application leaves
 * the board, and the picker is what chooses among the outcomes.
 *
 * It rides in a track the board reserves for it permanently, so appearing costs
 * the four columns no movement - see `board-columns.tsx` for why that matters
 * more than the whitespace it spends.
 *
 * Mounting into a running drag is supported rather than got away with: a
 * droppable's shape is derived reactively from the operation, so registering one
 * while a drag is initialized measures it and starts observing its position.
 */
export function CloseOutZone() {
  const { source } = useDragOperation();

  const { ref, isDropTarget } = useDroppable({
    id: CLOSE_OUT_TARGET,
    // Every live application can be closed on at least Rejected, Withdrawn or
    // Ghosted, so this takes a card from any column rather than a computed set.
    // Which outcomes it may be closed *on* is the picker's question.
    accept: [...ACTIVE_STAGES],
  });

  if (source == null) return null;

  return (
    <div
      ref={ref}
      className={cn(
        // Full height rather than a box at the top of the track, and that is a
        // requirement rather than a flourish: the keyboard rule reaches a target
        // sideways only when its box spans the height the lifted card is at, so
        // a short rail would be unreachable from a card near the bottom of a
        // long column.
        "flex w-24 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-border px-2 py-4 text-center text-xs text-muted-foreground lg:w-auto",
        // The words say what it is and the treatment says only that it is under
        // the pointer, which is the rule the columns follow too.
        isDropTarget && "border-border-strong bg-accent/40 text-foreground",
      )}
    >
      <span className="font-medium">Close out</span>
      {/* The half of the label that is unique. The picker this opens is titled
          "Close out {role}", so the first two words cannot tell them apart - and
          a test looking for the target would find the dialog instead. */}
      <span>drop here</span>
    </div>
  );
}
