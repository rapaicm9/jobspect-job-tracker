"use client";

// Client-owned for two reasons, and the second is the one that matters: the field
// state has to survive a refusal, and the idempotency key for a new contact has to
// be minted where the user commits. An action that minted its own would mint a
// second one on the second attempt, and one person would become two.

import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { CONTACT_ROLES } from "@/lib/enums";
import { keyForIntent, type Intent } from "@/lib/idempotency";
import { FormActions, FormError } from "@/ui/fields/form-actions";
import { SelectField } from "@/ui/fields/select-field";
import { applyFieldErrors } from "@/ui/fields/server-errors";
import { TextField } from "@/ui/fields/text-field";
import { TextareaField } from "@/ui/fields/textarea-field";

import { createContact } from "../actions/create-contact";
import { updateContact } from "../actions/update-contact";
import { CONTACT_ROLE_LABELS, type Contact } from "../contact";
import {
  contactFormSchema,
  emptyFormValues,
  toFormValues,
  type ContactFormInput,
  type ContactFormOutput,
} from "../contact-form-schema";
import { toContactRequest } from "../to-contact-request";

/** Every field this form renders, so a refusal naming another one is not lost. */
const FIELDS = ["name", "role", "email", "phone", "notes"] as const;

const GENERIC = "That contact has not been saved. Nothing was changed - please try again.";

export interface ContactFormProps {
  applicationId: string;
  /** Null when recording a contact rather than editing one. */
  contact: Contact | null;
  onDone: () => void;
}

export function ContactForm({ applicationId, contact, onDone }: ContactFormProps) {
  const [problem, setProblem] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  // Held in a ref rather than in state: it must not cause a render, and the rule
  // that changed content is a new intent lives in `keyForIntent`.
  const intent = useRef<Intent | null>(null);

  const form = useForm<ContactFormInput, unknown, ContactFormOutput>({
    resolver: standardSchemaResolver(contactFormSchema),
    // A field can break several rules at once, and only this reports more than
    // the first of them.
    criteriaMode: "all",
    defaultValues: contact === null ? emptyFormValues() : toFormValues(contact),
  });

  const record = (body: ReturnType<typeof toContactRequest>) => {
    // Keyed to the body rather than to the form, because the API fingerprints
    // what it receives: resubmitting the same person reuses the key and is one
    // contact, while changing a field before retrying is a new intent and needs
    // a new one.
    intent.current = keyForIntent(intent.current, JSON.stringify(body));

    return createContact({ idempotencyKey: intent.current.key, body });
  };

  const save = (values: ContactFormOutput) => {
    setProblem(null);

    const body = toContactRequest(contact, values, applicationId);

    startSaving(async () => {
      const result = await (contact === null
        ? record(body)
        : updateContact({ contactId: contact.id, body }));

      switch (result.kind) {
        case "saved":
          // The panel is server rendered and the action has already invalidated
          // this route, so the refreshed tree arrives with the action's own
          // response and closing is all there is left to do.
          onDone();
          return;

        case "invalid": {
          const unplaced = applyFieldErrors(form.setError, result.fieldErrors, FIELDS);
          if (unplaced.length > 0) setProblem(unplaced.join(" "));
          return;
        }

        case "refused":
          // Both refusals the API keys itself here name a link this form does not
          // show - an application or a company it cannot find - so they belong
          // above the form rather than against a field nobody can correct.
          if ((FIELDS as readonly string[]).includes(result.field)) {
            form.setError(result.field as (typeof FIELDS)[number], {
              type: "server",
              message: result.detail,
            });
          } else {
            setProblem(result.detail);
          }
          return;

        case "in-flight":
          // Not a failure. The contact is being written, and saying otherwise is
          // the message that makes somebody record them a second time.
          setProblem("This is still being saved. Give it a moment.");
          return;

        case "gone":
          setProblem("This no longer exists. Reload the page to see what is there now.");
          return;

        case "unavailable":
          setProblem("We could not reach the server. Nothing was saved - try again in a moment.");
          return;

        case "failed":
          setProblem(GENERIC);
      }
    });
  };

  return (
    <form
      // Built inside the handler rather than during render: `save` closes over
      // the intent ref, and handing that to `handleSubmit` while rendering is
      // reading a ref at render time.
      onSubmit={(event) => {
        void form.handleSubmit(save)(event);
      }}
      className="flex flex-col gap-5"
      noValidate
    >
      <TextField control={form.control} name="name" label="Name" autoComplete="off" />

      <SelectField
        control={form.control}
        name="role"
        label="Role"
        // Not a required choice: not knowing yet whether somebody is the recruiter
        // or the hiring manager is an ordinary state of a search, and the API
        // stores it as absent rather than refusing it.
        options={CONTACT_ROLES.map((role) => ({ value: role, label: CONTACT_ROLE_LABELS[role] }))}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        {/* The types are for the keyboard and the autofill hint. The form is
            noValidate, and the API is what judges either value - it answers each
            with a message keyed to its own field. */}
        <TextField control={form.control} name="email" label="Email" type="email" />
        <TextField control={form.control} name="phone" label="Phone" type="tel" />
      </div>

      <TextareaField
        control={form.control}
        name="notes"
        label="Notes"
        placeholder="How you know them, what they said, when to follow up."
      />

      <FormError message={problem} />

      <FormActions
        submitLabel={contact === null ? "Add contact" : "Save changes"}
        pendingLabel={contact === null ? "Adding…" : "Saving…"}
        pending={isSaving}
        onCancel={onDone}
      />
    </form>
  );
}
