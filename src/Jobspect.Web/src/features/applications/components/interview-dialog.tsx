"use client";

// Client-owned because it hands the shell a function, and a function is not a
// prop a Server Component can pass across the boundary. The panel that renders
// this stays a Server Component either way.

import type { Interview } from "../interview";

import { InterviewForm } from "./interview-form";
import { PanelFormDialog } from "./panel-form-dialog";

export interface InterviewDialogProps {
  applicationId: string;
  /** Null to schedule a round; a round to edit it. */
  interview: Interview | null;
  timeZoneId: string | null;
  /** The round as the panel rendered it, so one Edit trigger names its own row. */
  subject?: string;
}

/** The words this panel puts on the shared dialog, and the form inside it. */
export function InterviewDialog({
  applicationId,
  interview,
  timeZoneId,
  subject,
}: InterviewDialogProps) {
  const scheduling = interview === null;

  return (
    <PanelFormDialog
      triggerLabel={scheduling ? "Add interview" : "Edit"}
      subject={subject}
      title={scheduling ? "Add interview" : "Edit interview"}
      description={
        scheduling
          ? "A round on this application. Its outcome is recorded once it has happened."
          : "Every field is saved together, so leave what has not changed as it is."
      }
    >
      {(onDone) => (
        <InterviewForm
          applicationId={applicationId}
          interview={interview}
          timeZoneId={timeZoneId}
          onDone={onDone}
        />
      )}
    </PanelFormDialog>
  );
}
