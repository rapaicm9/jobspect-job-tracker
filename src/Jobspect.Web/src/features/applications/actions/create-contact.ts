"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { api } from "@/server/api/client";
import { idempotencyHeaders, withInFlightRetry } from "@/server/api/idempotency";
import { requireSession } from "@/server/dal";
import { callAuthenticated } from "@/server/session/call";

/**
 * A forgery guard, not a second statement of the API's rules - the same bound the
 * other actions record. A `'use server'` export is a public endpoint, so the body
 * is parsed before it is forwarded, and the numbers here are deliberately far
 * above anything the API accepts.
 */
const text = z.string().max(10_000).nullable();

const inputSchema = z.object({
  idempotencyKey: z.string().min(1).max(255),
  /** Read from the body rather than taken separately: the API has no nested route. */
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

export type CreateContactInput = z.input<typeof inputSchema>;

export type CreateContactResult =
  | { kind: "saved" }
  /** Field-keyed messages, several per field. */
  | { kind: "invalid"; fieldErrors: Record<string, string[]> }
  /** A refusal the API keyed to one field itself, carrying its own sentence. */
  | { kind: "refused"; field: string; detail: string }
  /** Still being written after one re-issue of the same key. Not a failure. */
  | { kind: "in-flight" }
  /** The application was deleted while the dialog was open. */
  | { kind: "gone" }
  | { kind: "unavailable" }
  | { kind: "failed" };

/**
 * Records a contact.
 *
 * A `POST` applied twice is two people, which is what the `Idempotency-Key` is
 * for. The key arrives from the component that formed the intent and is never
 * minted here: an action that minted its own would mint a second one on the
 * second call, which is the whole failure the header guards against.
 *
 * Failures return rather than throw, for the reason the other actions record:
 * Next replaces a thrown server error with a generic message and a digest, so
 * anything the caller has to tell apart has to come back as a value.
 */
export async function createContact(input: unknown): Promise<CreateContactResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { kind: "failed" };

  const { idempotencyKey, body } = parsed.data;
  const session = await requireSession();

  const result = await withInFlightRetry(idempotencyKey, (key) =>
    callAuthenticated(session.sid, (init) =>
      api.POST("/api/v1/contacts", {
        ...init,
        body,
        // Merged, never replaced. `callAuthenticated` re-issues this call with an
        // Authorization header of its own after a forced refresh, and overwriting
        // that would send the one retry that matters out unauthenticated.
        headers: { ...init.headers, ...idempotencyHeaders(key) },
      }),
    ),
  );

  if (result.ok) {
    // Invalidated here rather than refreshed from the component: a
    // `router.refresh()` after the action returns is a second render request
    // racing this one, and two concurrent server renders sharing one session is
    // how a read goes out unauthenticated. The list carries nothing about
    // contacts, so it is left alone.
    if (body.applicationId !== null) revalidatePath(`/applications/${body.applicationId}`);

    return { kind: "saved" };
  }

  switch (result.failure.kind) {
    case "validation":
      return { kind: "invalid", fieldErrors: result.failure.fieldErrors };

    case "field-error":
      // `contact.unknown_application` and `.unknown_company` both land here, and
      // neither names a field this form shows - so the caller puts them above it.
      return {
        kind: "refused",
        field: result.failure.field,
        detail: result.failure.problem.detail ?? "That value was refused.",
      };

    case "idempotency-in-flight":
      // Reached only after `withInFlightRetry` has waited and asked again, so the
      // first attempt is slower than the server's own estimate. The contact is
      // being written; reporting that as a failure is what makes somebody record
      // them a second time.
      return { kind: "in-flight" };

    case "not-found":
      return { kind: "gone" };

    case "unavailable":
      return { kind: "unavailable" };

    default:
      return { kind: "failed" };
  }
}
