"use client";

// Client-owned because it hands the shell a function, and a function is not a
// prop a Server Component can pass across the boundary. The panel that renders
// this stays a Server Component either way.

import type { Contact } from "../contact";

import { ContactForm } from "./contact-form";
import { PanelFormDialog } from "./panel-form-dialog";

export interface ContactDialogProps {
  applicationId: string;
  /** Null to record a contact; a contact to edit them. */
  contact: Contact | null;
  /** The person as the panel rendered them, so one Edit trigger names its row. */
  subject?: string;
}

/** The words this panel puts on the shared dialog, and the form inside it. */
export function ContactDialog({ applicationId, contact, subject }: ContactDialogProps) {
  const recording = contact === null;

  return (
    <PanelFormDialog
      triggerLabel={recording ? "Add contact" : "Edit"}
      subject={subject}
      title={recording ? "Add contact" : "Edit contact"}
      description={
        recording
          ? "Someone you are dealing with on this application. Everything but the name is optional."
          : "Every field is saved together, so leave what has not changed as it is."
      }
    >
      {(onDone) => <ContactForm applicationId={applicationId} contact={contact} onDone={onDone} />}
    </PanelFormDialog>
  );
}
