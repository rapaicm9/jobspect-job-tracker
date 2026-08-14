import type { Contact } from "../contact";
import type { PanelRead } from "../panel-read";

import { DetailPanel, PanelNote, PanelUnavailable } from "./detail-panel";

/** The enum members are one word to the API and two to a reader. */
const ROLE_LABELS: Record<NonNullable<Contact["role"]>, string> = {
  Recruiter: "Recruiter",
  HiringManager: "Hiring manager",
  Interviewer: "Interviewer",
  Referral: "Referral",
  Other: "Other",
};

export interface ContactsPanelProps {
  contacts: PanelRead<Contact>;
}

/**
 * Read-only, and no DELETE here either.
 *
 * The company is not repeated on a contact even though the API carries one: this
 * panel sits under a header that already names the company, so a line saying it
 * again on every row would be noise.
 */
export function ContactsPanel({ contacts }: ContactsPanelProps) {
  return (
    <DetailPanel title="Contacts">
      {contacts.kind === "failed" ? (
        <PanelUnavailable subject="Contacts" />
      ) : contacts.items.length === 0 ? (
        <PanelNote>None recorded.</PanelNote>
      ) : (
        <ul className="flex flex-col gap-3">
          {contacts.items.map((contact) => (
            <li key={contact.id} className="space-y-0.5">
              <p className="text-sm font-medium text-foreground">{contact.name}</p>
              {contact.role !== null && (
                <p className="text-xs text-muted-foreground">{ROLE_LABELS[contact.role]}</p>
              )}
              {contact.email !== null && (
                <p className="text-sm">
                  <a
                    href={`mailto:${contact.email}`}
                    className="break-all underline underline-offset-4 hover:text-muted-foreground"
                  >
                    {contact.email}
                  </a>
                </p>
              )}
              {contact.phone !== null && (
                <p className="text-sm">
                  <a
                    href={`tel:${contact.phone}`}
                    className="underline underline-offset-4 hover:text-muted-foreground"
                  >
                    {contact.phone}
                  </a>
                </p>
              )}
              {contact.notes !== null && (
                <p className="text-sm whitespace-pre-line text-muted-foreground">{contact.notes}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </DetailPanel>
  );
}
