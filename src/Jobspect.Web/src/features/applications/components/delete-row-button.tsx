"use client";

// Client-owned because the dialog it opens is, and because the row it removes
// lives in a client cache that only the browser can repair.

import { Trash2 } from "lucide-react";

import { Button } from "@/ui/button";

import { deleteApplication } from "../actions/delete-application";

import { DeleteApplicationDialog } from "./delete-application-dialog";

export interface DeleteRowButtonProps {
  applicationId: string;
  role: string;
  /** Takes the row out of the walk, which no server render can do for it. */
  onDeleted: () => void;
}

/**
 * The list's delete, in both layouts.
 *
 * An icon at row scale rather than the word, and ghost rather than the tinted
 * `destructive` the detail view wears. A column of red buttons down a list of
 * twenty-six applications would make the loudest thing on the primary screen of
 * the product the one action nobody came here to take; it turns destructive on
 * hover, where it is about to be pressed.
 *
 * The name is not the icon. Every row's control would otherwise be announced as
 * "Delete", twenty-six times over, with nothing to tell them apart - so each
 * carries its own row's role.
 */
export function DeleteRowButton({ applicationId, role, onDeleted }: DeleteRowButtonProps) {
  return (
    <DeleteApplicationDialog
      role={role}
      onConfirm={async () => {
        const result = await deleteApplication({ applicationId });
        if (result.kind === "deleted") onDeleted();

        return result;
      }}
      trigger={
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 aria-hidden="true" />
          <span className="sr-only">Delete {role}</span>
        </Button>
      }
    />
  );
}
