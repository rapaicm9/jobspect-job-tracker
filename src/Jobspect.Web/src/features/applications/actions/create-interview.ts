"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { api } from "@/server/api/client";
import { idempotencyHeaders, withInFlightRetry } from "@/server/api/idempotency";
import { requireSession } from "@/server/dal";
import { callAuthenticated } from "@/server/session/call";

/**
 * A forgery guard, not a second statement of the API's rules - the same bound
 * `create-application.ts` records. A `'use server'` export is a public endpoint,
 * so the body is parsed before it is forwarded, and the numbers here are
 * deliberately far above anything the API accepts.
 */
const text = z.string().max(10_000).nullable();

const inputSchema = z.object({
  applicationId: z.string().min(1).max(64),
  idempotencyKey: z.string().min(1).max(255),
  body: z.object({
    scheduledAt: text,
    type: text,
    format: text,
    notes: text,
  }),
});

export type CreateInterviewInput = z.input<typeof inputSchema>;

export type CreateInterviewResult =
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
 * Schedules a round on an application.
 *
 * A `POST` applied twice is two rounds, which is what the `Idempotency-Key` is
 * for. The key arrives from the component that formed the intent and is never
 * minted here: an action that minted its own would mint a second one on the
 * second call, which is the whole failure the header guards against.
 *
 * Failures return rather than throw, for the reason the other actions record:
 * Next replaces a thrown server error with a generic message and a digest, so
 * anything the caller has to tell apart has to come back as a value.
 */
export async function createInterview(input: unknown): Promise<CreateInterviewResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { kind: "failed" };

  const { applicationId, idempotencyKey, body } = parsed.data;
  const session = await requireSession();

  const result = await withInFlightRetry(idempotencyKey, (key) =>
    callAuthenticated(session.sid, (init) =>
      api.POST("/api/v1/applications/{applicationId}/interviews", {
        ...init,
        params: { path: { applicationId } },
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
    // how a read goes out unauthenticated. Revalidating here folds the re-render
    // into this response, where nothing is racing it. The list carries nothing
    // about interviews, so it is left alone.
    revalidatePath(`/applications/${applicationId}`);

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

    case "idempotency-in-flight":
      // Reached only after `withInFlightRetry` has waited and asked again, so the
      // first attempt is slower than the server's own estimate. The round is
      // being written; reporting that as a failure is what makes somebody
      // schedule it a second time.
      return { kind: "in-flight" };

    case "not-found":
      return { kind: "gone" };

    case "unavailable":
      return { kind: "unavailable" };

    default:
      return { kind: "failed" };
  }
}
