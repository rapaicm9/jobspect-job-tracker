"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { withCampaignScope } from "@/features/campaigns";
import { api } from "@/server/api/client";
import { idempotencyHeaders, withInFlightRetry } from "@/server/api/idempotency";
import { requireSession } from "@/server/dal";
import { callAuthenticated } from "@/server/session/call";

/**
 * A forgery guard, not a second statement of the API's rules - the same bound
 * `update-application.ts` and `add-note.ts` both record. A `'use server'` export
 * is a public endpoint, so the body is parsed before it is forwarded, and the
 * numbers here are deliberately far above anything the API accepts.
 */
const text = z.string().max(10_000).nullable();

const inputSchema = z.object({
  idempotencyKey: z.string().min(1).max(255),
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
    cvLabel: text,
    coverLetterLabel: text,
    customFields: z.record(z.string(), z.unknown()).nullable(),
  }),
});

export type CreateApplicationInput = z.input<typeof inputSchema>;

/**
 * Only the ways this can fail.
 *
 * Success does not return at all: it redirects to the list, so the caller never
 * sees a value for it. That is deliberate rather than incidental - see below.
 */
export type CreateApplicationResult =
  /** Field-keyed messages, several per field. */
  | { kind: "invalid"; fieldErrors: Record<string, string[]> }
  /** A refusal the API keyed to one field itself, carrying its own sentence. */
  | { kind: "refused"; field: string; detail: string }
  /** Still being written after one re-issue of the same key. Not a failure. */
  | { kind: "in-flight" }
  | { kind: "unavailable" }
  | { kind: "failed" };

/**
 * Opens an application.
 *
 * The one write on this client where applying the request twice is two rows
 * rather than one, which is what the `Idempotency-Key` is for. The key arrives
 * from the component that formed the intent and is never minted here: an action
 * that minted its own would mint a second one on the second call, which is the
 * whole failure the header guards against.
 *
 * Failures return rather than throw, for the reason the other actions record:
 * Next replaces a thrown server error with a generic message and a digest, so
 * anything the caller has to tell apart has to come back as a value.
 */
export async function createApplication(input: unknown): Promise<CreateApplicationResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { kind: "failed" };

  const { idempotencyKey, body } = parsed.data;
  const session = await requireSession();

  const result = await withInFlightRetry(idempotencyKey, (key) =>
    callAuthenticated(session.sid, (init) =>
      api.POST("/api/v1/applications", {
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
    // The list still holds the copy the client rendered before this application
    // existed, so it is invalidated and then navigated to from here rather than
    // from the component.
    //
    // Both halves in one response, and that is the point. Invalidating here and
    // pushing from the browser leaves Next re-rendering the page being left at
    // the same time as the page being arrived at, and two concurrent server
    // renders sharing one session is how a read goes out unauthenticated: the
    // token provider answers null when it cannot read the session and the call
    // is simply made without one. Redirecting collapses that to a single render.
    revalidatePath("/applications");
    redirect(withCampaignScope("/applications", body.campaignId));
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

    case "idempotency-in-flight":
      // Reached only after `withInFlightRetry` has waited and asked again, so the
      // first attempt is slower than the server's own estimate. The application
      // is being written; reporting that as a failure is what makes somebody
      // submit it a second time.
      return { kind: "in-flight" };

    case "unavailable":
      return { kind: "unavailable" };

    default:
      return { kind: "failed" };
  }
}
