import { toContactRole, type ContactRole } from "@/server/api/enums";

/** One contact under an application, as the panel renders it. */
export interface Contact {
  id: string;
  name: string;
  role: ContactRole | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
}

/** The response fields this reads. Structural, so the DTO satisfies it. */
export interface ContactSummary {
  id: string;
  name: string;
  role: null | string;
  email: null | string;
  phone: null | string;
  notes: null | string;
}

export function toContact(contact: ContactSummary): Contact {
  return {
    id: contact.id,
    name: contact.name,
    // A role this build has not heard of reads as absent rather than as itself.
    // Unlike a stage, a contact's role labels a person the panel names anyway, so
    // there is nothing lost by leaving it off.
    role: toContactRole(contact.role),
    email: contact.email,
    phone: contact.phone,
    notes: contact.notes,
  };
}
