"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { api } from "@/server/api/client";
import { requireSession } from "@/server/dal";
import { callAuthenticated } from "@/server/session/call";

/** A forgery guard rather than a second statement of the API's rules. */
const text = z.string().max(10_000).nullable();

const inputSchema = z.object({
  contactId: z.string().min(1).max(64),
  body: z.object({
    applicationId: z.string().max(64).nullable(),
    companyId: z.string().max(64).nullable(),
    name: text,
    role: text,
    email: text,
    phone: text,
    notes: text,
  }),
});

export type UpdateContactInput = z.input<typeof inputSchema>;

export type UpdateContactResult =
  | { kind: "saved" }
  /** Field-keyed messages, several per field. */
  | { kind: "invalid"; fieldErrors: Record<string, string[]> }
  /** A refusal the API keyed to one field itself, carrying its own sentence. */
  | { kind: "refused"; field: string; detail: string }
  /** The contact, or the application under it, is gone. */
  | { kind: "gone" }
  | { kind: "unavailable" }
  | { kind: "failed" };

/**
 * Replaces every editable field of one contact.
 *
 * No `Idempotency-Key`, and that is not an omission: a full replace applied twice
 * leaves exactly what applying it once does, so the endpoint takes no such
 * header. Recording a new contact is where the key comes back.
 *
 * There is no DELETE on this resource either. A contact who is no longer worth
 * keeping has no affordance here, which is the API's shape rather than an
 * omission of this screen's.
 *
 * Failures return rather than throw, for the reason the other actions record.
 */
export async function updateContact(input: unknown): Promise<UpdateContactResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { kind: "failed" };

  const { contactId, body } = parsed.data;
  const session = await requireSession();

  const result = await callAuthenticated(session.sid, (init) =>
    api.PUT("/api/v1/contacts/{id}", {
      ...init,
      params: { path: { id: contactId } },
      body,
    }),
  );

  if (result.ok) {
    // Folded into this response rather than refreshed from the component, for the
    // reason `update-application.ts` records at length.
    if (body.applicationId !== null) revalidatePath(`/applications/${body.applicationId}`);

    return { kind: "saved" };
  }

  switch (result.failure.kind) {
    case "validation":
      return { kind: "invalid", fieldErrors: result.failure.fieldErrors };

    case "field-error":
      return {
        kind: "refused",
        field: result.failure.field,
        detail: result.failure.problem.detail ?? "That value was refused.",
      };

    case "not-found":
      return { kind: "gone" };

    case "unavailable":
      return { kind: "unavailable" };

    default:
      return { kind: "failed" };
  }
}
