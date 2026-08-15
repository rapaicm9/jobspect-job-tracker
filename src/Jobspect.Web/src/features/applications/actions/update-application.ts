"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { api } from "@/server/api/client";
import { requireSession } from "@/server/dal";
import { callAuthenticated } from "@/server/session/call";

/**
 * A forgery guard rather than a second statement of the API's rules.
 *
 * A `'use server'` export is a public endpoint - the identifier is a hash of the
 * source location, and anyone holding it can call this with any argument at all
 * - so the body is parsed before it is forwarded. The bounds are deliberately
 * far above anything the API accepts: the server states the real limits and
 * answers a breach with a message keyed to its field, which is the thing worth
 * showing. Restating those numbers here would answer the honest case with
 * "something went wrong" and drift the moment the API moved.
 */
const text = z.string().max(10_000).nullable();

const inputSchema = z.object({
  applicationId: z.string().min(1).max(64),
  body: z.object({
    role: text,
    campaignId: z.string().max(64).nullable(),
    companyId: z.string().max(64).nullable(),
    companyName: text,
    compensation: z.object({ amount: z.number(), currency: z.string().max(16) }).nullable(),
    location: text,
    workMode: text,
    postingUrl: text,
    source: text,
    appliedDate: text,
    applicationDeadline: text,
    offerDecisionDeadline: text,
    cvLabel: text,
    coverLetterLabel: text,
    // Passed through as it arrives. An answer is whatever its definition calls
    // for, which is exactly why the contract describes these values as an empty
    // schema, and the API validates every one against that definition anyway.
    customFields: z.record(z.string(), z.unknown()).nullable(),
  }),
});

export type UpdateApplicationInput = z.input<typeof inputSchema>;

export type UpdateApplicationResult =
  | { kind: "saved" }
  /** Field-keyed messages, several per field. */
  | { kind: "invalid"; fieldErrors: Record<string, string[]> }
  /** A refusal the API keyed to one field itself, carrying its own sentence. */
  | { kind: "refused"; field: string; detail: string }
  /** The account may not write custom-field answers. Nothing was changed. */
  | { kind: "not-entitled" }
  /** Deleted while the form was open. */
  | { kind: "gone" }
  | { kind: "unavailable" }
  | { kind: "failed" };

/**
 * Replaces every editable field of one application.
 *
 * No `Idempotency-Key`, and that is not an omission: a full replace applied
 * twice leaves exactly what applying it once does, so the endpoint takes no such
 * header. Creating is where the key comes back.
 *
 * Failures return rather than throw, for the reason the other actions record:
 * Next replaces a thrown server error with a generic message and a digest, so
 * anything the caller has to tell apart has to come back as a value. Here that
 * matters twice over - a field-keyed refusal belongs against its field, and an
 * entitlement refusal belongs nowhere near one.
 */
export async function updateApplication(input: unknown): Promise<UpdateApplicationResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { kind: "failed" };

  const { applicationId, body } = parsed.data;
  const session = await requireSession();

  const result = await callAuthenticated(session.sid, (init) =>
    api.PUT("/api/v1/applications/{id}", {
      ...init,
      params: { path: { id: applicationId } },
      body,
    }),
  );

  if (result.ok) {
    // Invalidated here rather than refreshed from the component, and the
    // difference is not cosmetic: a `router.refresh()` after the action returns
    // is a *second* render request racing this one, and two concurrent server
    // renders sharing one session is how a read goes out unauthenticated - the
    // token provider answers null when it cannot read the session, and the call
    // is simply made without one. Revalidating here folds the re-render into
    // this response, where nothing is racing it.
    revalidatePath(`/applications/${applicationId}`);
    revalidatePath("/applications");

    return { kind: "saved" };
  }

  switch (result.failure.kind) {
    case "validation":
      return { kind: "invalid", fieldErrors: result.failure.fieldErrors };

    case "field-error":
      // The API decided which field is at fault and wrote the sentence. An
      // offer-decision deadline moved off Offer, an unknown company, an unknown
      // campaign: all three name a field this form is showing.
      return {
        kind: "refused",
        field: result.failure.field,
        detail: result.failure.problem.detail ?? "That value was refused.",
      };

    case "entitlement":
      return { kind: "not-entitled" };

    case "not-found":
      return { kind: "gone" };

    case "unavailable":
      return { kind: "unavailable" };

    default:
      return { kind: "failed" };
  }
}
