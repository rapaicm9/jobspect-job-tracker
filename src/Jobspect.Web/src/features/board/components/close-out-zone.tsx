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
 * Closing an application is a different kind of transition from advancing one, so
 * it gets a different gesture rather than a fifth column - a column to the right
 * of Offer would put four unordered outcomes on an axis that means order
 * (ADR 0001). A permanent strip would be weight on the board for something that
 * happens once per application, so it arrives with the gesture that can use it.
 *
 * Mounting into a running drag is supported rather than got away with: a
 * droppable's shape is derived reactively from the operation, so registering one
 * while a drag is initialized measures it and starts observing its position.
 *
 * It sits below the columns and nothing above it moves when it appears.
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
        "flex min-h-(--target-min) items-center justify-center rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground",
        // The words say what it is and the treatment says only that it is under
        // the pointer, which is the rule the columns follow too.
        isDropTarget && "border-border-strong bg-accent/40 text-foreground",
      )}
    >
      Close out — drop to record an outcome
    </div>
  );
}
