import "server-only";

import { revalidatePath } from "next/cache";

import { api } from "@/server/api/client";
import { requireSession } from "@/server/dal";
import { callAuthenticated } from "@/server/session/call";

/**
 * What removing an application can answer.
 *
 * Returned rather than thrown, for the reason the other writes record: Next
 * replaces a thrown server error with a generic message and a digest, so
 * anything the caller has to tell apart has to come back as a value.
 */
export type DeleteApplicationResult =
  | { kind: "deleted" }
  | { kind: "unavailable" }
  /** The budget is spent. Retrying now is what keeps it spent. */
  | { kind: "rate-limited"; retryAfterSeconds: number | null }
  | { kind: "failed" };

/**
 * The one call both intents make.
 *
 * Shared here rather than duplicated because the difference between the two is
 * only what happens *after* a success - the list repairs its own rows, and the
 * detail view has to leave the page it is on. That difference cannot live in one
 * action: leaving is a server-side redirect, and a redirect belongs to the
 * intent that wants it rather than to a flag.
 *
 * No `Idempotency-Key`: the endpoint takes none, because a delete needs none.
 * Applying it twice leaves exactly what applying it once does.
 *
 * **A 404 is success**, which is the one thing worth reading twice. It means the
 * application is not there - which is what the caller asked for - and both ways
 * to reach it are ordinary: a double press where the first call won, and a row
 * already deleted in another tab. Reporting it as a failure would put an error
 * in front of somebody whose intent was carried out. A stranger's id lands here
 * too, and answering that identically is the point rather than a side effect.
 */
export async function requestDeletion(applicationId: string): Promise<DeleteApplicationResult> {
  const session = await requireSession();

  const result = await callAuthenticated(session.sid, (init) =>
    api.DELETE("/api/v1/applications/{id}", {
      ...init,
      params: { path: { id: applicationId } },
    }),
  );

  if (result.ok || result.failure.kind === "not-found") {
    // Invalidated here rather than refreshed from the component: folding the
    // re-render into this response leaves nothing for a second request to race.
    //
    // **The deleted application's own route is load-bearing, and was removed
    // once on the theory that a route with nothing behind it would answer 404
    // by itself.** It does not. Asked for again - a bookmark, a second tab, the
    // history - it serves the render it already had, and the reader is looking
    // at an application that no longer exists. The list and the board are named
    // because each shows the row that has gone.
    //
    // What this cannot repair at all is the list's own client cache, which is
    // seeded once and ignores a later render. The list drops the row itself.
    revalidatePath(`/applications/${applicationId}`);
    revalidatePath("/applications");
    revalidatePath("/board");

    return { kind: "deleted" };
  }

  switch (result.failure.kind) {
    case "unavailable":
      return { kind: "unavailable" };

    case "rate-limited":
      return { kind: "rate-limited", retryAfterSeconds: result.failure.retryAfterSeconds };

    default:
      return { kind: "failed" };
  }
}
