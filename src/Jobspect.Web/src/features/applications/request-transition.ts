import "server-only";

import { revalidatePath } from "next/cache";

import { api } from "@/server/api/client";
import { idempotencyHeaders, withInFlightRetry } from "@/server/api/idempotency";
import { requireSession } from "@/server/dal";
import { callAuthenticated } from "@/server/session/call";

import type { TimelinePage } from "./activity-reading";
import { listActivity } from "./queries/list-activity";

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
  /**
   * The move, and the history it wrote.
   *
   * The timeline travels with the answer because that panel is a client cache,
   * and a client cache is the one thing a later server render cannot correct:
   * `router.refresh()` merges the new payload while preserving client state, and
   * a query already holding data ignores a fresh `initialData`. So a screen that
   * has to show the entry this move wrote can only be handed it here.
   *
   * `TimelinePage` rather than the query module's `ActivityPage`: the two are
   * structurally identical, and the split exists because this type crosses into a
   * Client Component while that module is `server-only`.
   *
   * Null when the history could not be read. The move still happened.
   */
  | { kind: "moved"; timeline: TimelinePage | null }
  /** The pipeline refused it. `detail` names both stages; show it verbatim. */
  | { kind: "illegal"; detail: string }
  /** Retryable, and never a validation error - nothing about the request is wrong. */
  | { kind: "unavailable" }
  /** Still being written after one re-issue of the same key. */
  | { kind: "in-flight" }
  /** The budget is spent. Retrying now is what keeps it spent. */
  | { kind: "rate-limited"; retryAfterSeconds: number | null }
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

  if (result.ok) {
    // Invalidated here rather than refreshed from the component, which is how the
    // other writes on this screen already work: folding the re-render into this
    // response leaves nothing for a second request to race. The list is named as
    // well as the detail screen because it renders the stage column, and a
    // refresh of the detail route never invalidated it.
    //
    // The board is named for completeness rather than for a failure anyone can
    // reproduce, and that is worth stating plainly rather than dressing up.
    // Removing this line changes nothing observable: the drag reconciles, the
    // repaint still costs five reads, and a move made from the detail menu still
    // shows on the board when it is next opened. Two things already cover it -
    // an action re-renders the route it was called from without being asked, and
    // any `revalidatePath` at all appears to drop the client Router Cache
    // wholesale rather than one path of it.
    //
    // It stays because the second of those is a framework side effect this code
    // would rather not depend on, and because naming every route a stage change
    // invalidates is the thing that keeps being true as revalidation gets more
    // path-scoped. Nothing here should be read as evidence it is load-bearing.
    revalidatePath(`/applications/${applicationId}`);
    revalidatePath("/applications");
    revalidatePath("/board");

    const activity = await listActivity(applicationId);

    return { kind: "moved", timeline: activity.kind === "page" ? activity.page : null };
  }

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

    case "rate-limited":
      // Distinct from a plain failure because the advice is the opposite one:
      // trying again immediately is what keeps the budget spent, and the API
      // already says how long to wait.
      return { kind: "rate-limited", retryAfterSeconds: result.failure.retryAfterSeconds };

    default:
      return { kind: "failed" };
  }
}
