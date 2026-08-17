import type { Contact } from "./contact";
import type { ContactFormOutput } from "./contact-form-schema";

/**
 * The body both contact writes send. Structural rather than the generated type,
 * which stays behind the API layer.
 *
 * One shape for create and update, because the API has one: unlike the interview
 * pair there is no field the create endpoint lacks, so there is no delta to
 * state and no second mapper to keep in step.
 */
export interface ContactBody {
  applicationId: string | null;
  companyId: string | null;
  name: string | null;
  role: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
}

/**
 * Everything the API stores about one contact, as one body.
 *
 * `PUT` here replaces rather than patches, so a property left off is a property
 * cleared - and the two the form never shows are the ones at risk, since nothing
 * on screen would look wrong afterwards.
 *
 * **The company link is not this screen's to set.** A new contact gets none: the
 * panel records the people on an application, the API is satisfied by that link
 * alone, and stamping the application's company would record a connection the
 * user never made. It would also go stale - the company on an application is
 * editable, so the id copied today is the wrong one the moment somebody retypes
 * the name. An existing contact keeps whatever it already had, which may well
 * have been set somewhere this client does not have a screen for yet.
 */
export function toContactRequest(
  contact: Contact | null,
  values: ContactFormOutput,
  applicationId: string,
): ContactBody {
  return {
    // The stored link on an edit, this panel's application on a new one. They
    // agree today, since the panel reads by application - but a replace sends
    // back what the record holds, not what the screen assumes it holds.
    applicationId: contact?.applicationId ?? applicationId,
    companyId: contact?.companyId ?? null,
    name: values.name,
    role: values.role,
    email: values.email,
    phone: values.phone,
    notes: values.notes,
  };
}
