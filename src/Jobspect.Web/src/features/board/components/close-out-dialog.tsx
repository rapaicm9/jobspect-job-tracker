"use client";

// Client-owned because a dialog is open or it is not, and because the drop that
// opens this one happens in the browser.

import { useState } from "react";

import type { ActiveStage, TerminalStage } from "@/lib/enums";
import { Button } from "@/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/ui/dialog";

import type { BoardCard } from "../board";
import { closeOutcomesFor } from "../drag";

/** The card the zone received, and the column it came from. */
export interface ClosingCard {
  card: BoardCard;
  from: ActiveStage;
}

export interface CloseOutDialogProps {
  /** Null when nothing has been dropped on the zone. */
  closing: ClosingCard | null;
  onDismiss: () => void;
  onPick: (outcome: TerminalStage) => void;
  /**
   * Where focus goes when this closes.
   *
   * It has to be said explicitly, and the reason is the shape of the gesture: a
   * dialog normally returns focus to the trigger that opened it, and this one has
   * no trigger at all - it is opened by a drop, and by then the zone that received
   * it has already gone with the drag. Left to the default, focus lands on the
   * document body.
   *
   * The board itself rather than the card's own grip, in both directions. On a
   * pick the card is on its way off the board, so its grip is not there to take
   * focus; sending it there on a dismissal only and to the board otherwise would
   * be two behaviours to explain for one keystroke.
   */
  boardRef: React.RefObject<HTMLElement | null>;
}

/**
 * The outcome picker.
 *
 * Not `PanelFormDialog`, which is the shared shell one column over: that one owns
 * its own trigger button, and the whole point here is that the trigger is a
 * gesture.
 *
 * Picking commits. There is no confirm step, because the drop was already the
 * deliberate act and a refusal is recoverable - the card comes back and the board
 * says why, the same as any other refused move.
 */
export function CloseOutDialog({ closing, onDismiss, onPick, boardRef }: CloseOutDialogProps) {
  // The last card this was opened for, kept so the dialog still reads correctly
  // while it animates closed. `closing` is null by then, and rendering nothing
  // would blank the contents a beat before the dialog itself goes. Adjusted
  // during render rather than in an effect, which is the shape React documents
  // for state derived from a prop: it re-renders before anything is painted.
  const [subject, setSubject] = useState(closing);
  if (closing !== null && closing !== subject) setSubject(closing);

  return (
    <Dialog
      open={closing !== null}
      onOpenChange={(open) => {
        if (!open) onDismiss();
      }}
    >
      <DialogContent finalFocus={boardRef}>
        {subject !== null && (
          <>
            <DialogHeader>
              <DialogTitle>Close out {subject.card.role}</DialogTitle>
              <DialogDescription>
                {subject.card.companyName !== null && <>{subject.card.companyName} · </>}
                Currently in {subject.from}. How did it end?
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-wrap gap-2">
              {/* Only the outcomes the pipeline allows from here, which is why
                  Accepted is missing from everywhere but Offer: it is earned from
                  an offer, and offering it elsewhere would be inviting a refusal
                  the transition menu pointedly does not offer either. */}
              {closeOutcomesFor(subject.from).map((outcome) => (
                <Button
                  key={outcome}
                  type="button"
                  variant="outline"
                  onClick={() => {
                    onPick(outcome);
                  }}
                >
                  {outcome}
                </Button>
              ))}
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onDismiss}>
                Cancel
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
