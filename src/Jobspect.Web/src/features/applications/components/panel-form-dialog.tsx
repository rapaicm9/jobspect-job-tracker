"use client";

// Client-owned because a dialog is open or it is not, and that is state. The
// panels around these stay Server Components: each trigger is a leaf, so a screen
// with four rows on it ships one form's worth of client code rather than four
// panels' worth.

import { useState } from "react";

import { Button } from "@/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/ui/dialog";

export interface PanelFormDialogProps {
  /** What the trigger reads. Short: the row it sits on is the visible context. */
  triggerLabel: string;
  /**
   * What tells one row's trigger from the next, read out but not shown.
   *
   * A column of buttons all called "Edit" is a list of identical choices to
   * anybody navigating by control rather than by eye, so each names its row.
   * Absent on a trigger that is already unique on the screen.
   */
  subject?: string;
  title: string;
  description: string;
  /** The form, handed the callback that closes the dialog once it has saved. */
  children: (onDone: () => void) => React.ReactNode;
}

/**
 * A dialog rather than the panel swapping itself for a form, which is what the
 * facts panel does one column over.
 *
 * The difference is what the two are editing. An application is the page and its
 * form can take the width; an interview or a contact is one of several in a
 * narrow column, and replacing the list with a form takes away the rows the new
 * one is being recorded against.
 *
 * Shared because the second panel wanted the identical shell, and the only parts
 * that differ are the words and the form inside.
 */
export function PanelFormDialog({
  triggerLabel,
  subject,
  title,
  description,
  children,
}: PanelFormDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>
        {triggerLabel}
        {subject !== undefined && <span className="sr-only"> {subject}</span>}
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {children(() => {
          setOpen(false);
        })}
      </DialogContent>
    </Dialog>
  );
}
