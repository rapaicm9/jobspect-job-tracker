"use client";

// Client-owned because a dialog is open or it is not, and that is state. The
// panel around it stays a Server Component: each trigger is a leaf, so a screen
// with four rounds on it ships one form's worth of client code rather than four
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

import type { Interview } from "../interview";

import { InterviewForm } from "./interview-form";

export interface InterviewDialogProps {
  applicationId: string;
  /** Null to schedule a round; a round to edit it. */
  interview: Interview | null;
  timeZoneId: string | null;
  /**
   * The round as the panel already rendered it, which is what tells one Edit
   * button from the next.
   *
   * A column of buttons all called "Edit" is a list of identical choices to
   * anybody navigating by control rather than by eye. The visible label stays
   * short, since the row it sits on is the sighted reader's context.
   */
  subject?: string;
}

/**
 * A dialog rather than the panel swapping itself for a form, which is what the
 * facts panel does one column over.
 *
 * The difference is what the two are editing. An application is the page, and its
 * form can take the width; a round is one of several in a narrow column, and
 * replacing the list with a form takes away the rounds it is being scheduled
 * around.
 */
export function InterviewDialog({
  applicationId,
  interview,
  timeZoneId,
  subject,
}: InterviewDialogProps) {
  const [open, setOpen] = useState(false);
  const scheduling = interview === null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>
        {scheduling ? "Add interview" : "Edit"}
        {subject !== undefined && <span className="sr-only"> {subject}</span>}
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{scheduling ? "Add interview" : "Edit interview"}</DialogTitle>
          <DialogDescription>
            {scheduling
              ? "A round on this application. Its outcome is recorded once it has happened."
              : "Every field is saved together, so leave what has not changed as it is."}
          </DialogDescription>
        </DialogHeader>

        <InterviewForm
          applicationId={applicationId}
          interview={interview}
          timeZoneId={timeZoneId}
          onDone={() => {
            setOpen(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
