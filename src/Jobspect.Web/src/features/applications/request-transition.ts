import "server-only";

import { api } from "@/server/api/client";
import { idempotencyHeaders, withInFlightRetry } from "@/server/api/idempotency";
import { requireSession } from "@/server/dal";
import { callAuthenticated } from "@/server/session/call";

/**
 * What a pipeline move can answer.
 *
 * Returned rather than thrown, for the reason the other actions record: Next
 * replaces a thrown server error with a generic message and a digest, so
 * anything the caller has to tell apart has to come back as a value. Telling an
 * illegal move from an outage apart is the whole point here - one is a fact
 * about this application and the other is worth retrying.
 */
export type TransitionResult =
  | { kind: "moved" }
  /** The pipeline refused it. `detail` names both stages; show it verbatim. */
  | { kind: "illegal"; detail: string }
  /** Retryable, and never a validation error - nothing about the request is wrong. */
  | { kind: "unavailable" }
  /** Still being written after one re-issue of the same key. */
  | { kind: "in-flight" }
  | { kind: "failed" };

/**
 * The one call both intents make.
 *
 * Shared here rather than duplicated because the difference between advancing
 * and closing is which stages the caller will accept, and that belongs in each
 * action's own schema where a forged call meets it.
 */
export async function requestTransition(
  applicationId: string,
  targetStage: string,
  idempotencyKey: string,
): Promise<TransitionResult> {
  const session = await requireSession();

  const result = await withInFlightRetry(idempotencyKey, (key) =>
    callAuthenticated(session.sid, (init) =>
      api.POST("/api/v1/applications/{id}/transition", {
        ...init,
        params: { path: { id: applicationId } },
        body: { targetStage },
        // Merged, never replaced: `callAuthenticated` re-issues this call with an
        // Authorization header of its own after a forced refresh.
        headers: { ...init.headers, ...idempotencyHeaders(key) },
      }),
    ),
  );

  if (result.ok) return { kind: "moved" };

  switch (result.failure.kind) {
    case "illegal-transition":
      // The server's own words. It names both stages, and it knows which move
      // was refused better than a client reconstructing the sentence would.
      return {
        kind: "illegal",
        detail: result.failure.problem.detail ?? "That move is not allowed from this stage.",
      };

    case "unavailable":
      return { kind: "unavailable" };

    case "idempotency-in-flight":
      return { kind: "in-flight" };

    default:
      return { kind: "failed" };
  }
}
