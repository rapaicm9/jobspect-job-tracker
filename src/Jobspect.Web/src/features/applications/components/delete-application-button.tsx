"use client";

// Client-owned because the dialog it opens is.

import { Button } from "@/ui/button";

import { deleteApplicationAndReturn } from "../actions/delete-application-and-return";

import { DeleteApplicationDialog } from "./delete-application-dialog";

export interface DeleteApplicationButtonProps {
  applicationId: string;
  role: string;
  /** The raw scope off the URL, so the way out lands on the list it came from. */
  campaignId: string | null;
}

/**
 * The detail view's delete, beside Status in the header.
 *
 * `destructive` rather than the list's ghost icon: there is one of these on the
 * screen instead of one per row, and the button is the whole of what it does, so
 * it can say what it is. In this design system that is red lettering on a faint
 * wash rather than a filled red block, which sits at the same weight as the
 * outlined Status button next to it without borrowing its border.
 *
 * Leaving the page is the server's job here rather than this component's - see
 * the action for why a `router.replace` after the fact loses a race often enough
 * to watch it happen.
 */
export function DeleteApplicationButton({
  applicationId,
  role,
  campaignId,
}: DeleteApplicationButtonProps) {
  return (
    <DeleteApplicationDialog
      role={role}
      onConfirm={() => deleteApplicationAndReturn({ applicationId, campaignId })}
      trigger={
        <Button type="button" variant="destructive" size="sm">
          Delete
        </Button>
      }
    />
  );
}
