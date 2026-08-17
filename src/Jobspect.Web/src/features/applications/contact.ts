import { toContactRole, type ContactRole } from "@/lib/enums";

// The enum members are one word to the API and two to a reader. Here rather than
// in the panel because the form offers the same members as options, and a select
// naming a role differently from the row it came off reads as two things.
export const CONTACT_ROLE_LABELS: Record<ContactRole, string> = {
  Recruiter: "Recruiter",
  HiringManager: "Hiring manager",
  Interviewer: "Interviewer",
  Referral: "Referral",
  Other: "Other",
};

/** One contact under an application, as the panel renders it. */
export interface Contact {
  id: string;
  /**
   * Both links are carried although nothing renders them, because a full replace
   * has to send back what it was not asked to change. This panel reads by
   * application, so the first is always its own - and the second is whatever the
   * contact already had, which is not this screen's to invent.
   */
  applicationId: string | null;
  companyId: string | null;
  name: string;
  role: ContactRole | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
}

/** The response fields this reads. Structural, so the DTO satisfies it. */
export interface ContactSummary {
  id: string;
  applicationId: null | string;
  companyId: null | string;
  name: string;
  role: null | string;
  email: null | string;
  phone: null | string;
  notes: null | string;
}

export function toContact(contact: ContactSummary): Contact {
  return {
    id: contact.id,
    applicationId: contact.applicationId,
    companyId: contact.companyId,
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
