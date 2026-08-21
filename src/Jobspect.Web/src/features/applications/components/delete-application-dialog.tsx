"use client";

// Client-owned because a dialog is open or it is not, and that is state.

import { useState, useTransition } from "react";

import { Alert, AlertDescription } from "@/ui/alert";
import { Button } from "@/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/ui/dialog";

import type { DeleteApplicationResult } from "../delete-application";

export interface DeleteApplicationDialogProps {
  /** Named in the question, so the confirmation is about a thing rather than a row. */
  role: string;
  /** The control that opens it. Each placement styles its own. */
  trigger: React.ReactElement;
  /**
   * The action to run, supplied by the placement.
   *
   * Two intents share this dialog and they end differently - the list stays
   * where it is and repairs its own rows, the detail view leaves the page. That
   * is two Server Actions rather than one with a flag, so which one runs is the
   * caller's to say.
   */
  onConfirm: () => Promise<DeleteApplicationResult>;
}

/**
 * The confirmation, shared by both placements.
 *
 * A delete needs one and a transition does not, and the difference is what a
 * mistake costs. A wrong move is corrected by making another - the pipeline runs
 * both ways. This is the only control in the product that destroys something,
 * and in the list it sits one stray click from the row it belongs to.
 *
 * The question names what goes with it. The cascade is not obvious from a button
 * called Delete, and finding out afterwards that the interviews went too is
 * exactly the surprise a confirmation exists to prevent. It carries no counts:
 * the list row does not have them, and one dialog that reads the same in both
 * places is worth more than a sentence that is sharper in one of them.
 */
export function DeleteApplicationDialog({
  role,
  trigger,
  onConfirm,
}: DeleteApplicationDialogProps) {
  const [open, setOpen] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [isDeleting, startDeleting] = useTransition();

  const confirm = () => {
    setProblem(null);

    startDeleting(async () => {
      const result = await onConfirm();

      switch (result.kind) {
        case "deleted":
          // Only the intent that stays on the page gets here. The other one
          // redirects from the server, so its promise never resolves.
          setOpen(false);
          return;

        case "rate-limited":
          // The opposite advice from the others: trying again immediately is
          // what keeps the budget spent.
          setProblem(
            result.retryAfterSeconds === null
              ? "Too many requests just now. Wait a moment and try again."
              : `Too many requests just now. Try again in ${result.retryAfterSeconds}s.`,
          );
          return;

        case "unavailable":
          setProblem("The server could not be reached. Nothing was deleted.");
          return;

        default:
          setProblem("It could not be deleted. Nothing was changed.");
      }
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setProblem(null);
      }}
    >
      <DialogTrigger render={trigger} />

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete {role}?</DialogTitle>
          <DialogDescription>
            Its interviews, contacts and history go with it. This cannot be undone.
          </DialogDescription>
        </DialogHeader>

        {problem !== null && (
          <Alert variant="destructive">
            <AlertDescription>{problem}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            disabled={isDeleting}
            onClick={() => {
              setOpen(false);
            }}
          >
            Cancel
          </Button>
          {/* Solid rather than the tinted trigger's variant: this is the button
              that does the thing, and the tint cannot clear 4.5:1 on a raised
              surface in dark. Not the default focus either - the destructive
              choice should be chosen rather than arrived at by pressing Enter
              on a dialog that has just opened. */}
          <Button type="button" variant="destructiveSolid" disabled={isDeleting} onClick={confirm}>
            {isDeleting ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
