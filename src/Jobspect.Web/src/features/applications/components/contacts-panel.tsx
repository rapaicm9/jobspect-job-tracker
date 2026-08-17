import { CONTACT_ROLE_LABELS, type Contact } from "../contact";
import type { PanelRead } from "../panel-read";

import { ContactDialog } from "./contact-dialog";
import { DetailPanel, PanelNote, PanelUnavailable } from "./detail-panel";

export interface ContactsPanelProps {
  applicationId: string;
  contacts: PanelRead<Contact>;
}

/**
 * No DELETE here either, so nothing offers one.
 *
 * The company is not repeated on a contact even though the API carries one: this
 * panel sits under a header that already names the company, so a line saying it
 * again on every row would be noise.
 *
 * The order is the API's - by name - and is not sorted again here.
 */
export function ContactsPanel({ applicationId, contacts }: ContactsPanelProps) {
  return (
    <DetailPanel
      title="Contacts"
      action={
        // Nothing to add against when the read failed: the panel could not show
        // the person afterwards either, so the write would look like it did
        // nothing at all.
        contacts.kind === "failed" ? undefined : (
          <ContactDialog applicationId={applicationId} contact={null} />
        )
      }
    >
      {contacts.kind === "failed" ? (
        <PanelUnavailable subject="Contacts" />
      ) : contacts.items.length === 0 ? (
        <PanelNote>None recorded.</PanelNote>
      ) : (
        <ul aria-label="Contacts" className="flex flex-col gap-3">
          {contacts.items.map((contact) => (
            <li key={contact.id} className="flex items-start justify-between gap-3">
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-foreground">{contact.name}</p>
                {contact.role !== null && (
                  <p className="text-xs text-muted-foreground">
                    {CONTACT_ROLE_LABELS[contact.role]}
                  </p>
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
                  <p className="text-sm whitespace-pre-line text-muted-foreground">
                    {contact.notes}
                  </p>
                )}
              </div>

              <ContactDialog
                applicationId={applicationId}
                contact={contact}
                subject={contact.name}
              />
            </li>
          ))}
        </ul>
      )}
    </DetailPanel>
  );
}
