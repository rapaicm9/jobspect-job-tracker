import { z } from "zod";

import { CONTACT_ROLES } from "@/lib/enums";
import { optionalText, requiredText } from "@/lib/form-schema";

import type { Contact } from "./contact";

/**
 * What both contact forms validate, and only that.
 *
 * One schema covers recording a contact and editing one, because the two
 * requests are the same seven fields - unlike the interview pair, where the
 * create endpoint has no outcome. Nothing here has to state a difference that
 * does not exist.
 *
 * The role is genuinely optional, so it stays a nullable choice rather than a
 * `requiredChoice`: not knowing whether somebody is the recruiter or the hiring
 * manager is a normal state of a job search, and the API stores it as absent.
 *
 * Shape rather than policy: the email and phone checks live on the server, which
 * answers each keyed to its own field. Restating them here would refuse a value
 * the API might accept and drift the moment either rule moved.
 */
export const contactFormSchema = z.object({
  name: requiredText("A name is required."),
  role: z.enum(CONTACT_ROLES).nullable(),
  email: optionalText(),
  phone: optionalText(),
  notes: optionalText(),
});

export type ContactFormInput = z.input<typeof contactFormSchema>;
export type ContactFormOutput = z.output<typeof contactFormSchema>;

/** A blank form. Strings rather than nulls, for the reason `toFormValues` gives. */
export function emptyFormValues(): ContactFormInput {
  return { name: "", role: null, email: "", phone: "", notes: "" };
}

/**
 * A stored contact, as the form holds it while it is being edited.
 *
 * Text is `""` rather than null: an input is a string while somebody is typing
 * in it, and the schema turns the blank back into null on the way out. The role
 * binds null directly, because the select has an item for it.
 */
export function toFormValues(contact: Contact): ContactFormInput {
  return {
    name: contact.name,
    role: contact.role,
    email: contact.email ?? "",
    phone: contact.phone ?? "",
    notes: contact.notes ?? "",
  };
}
