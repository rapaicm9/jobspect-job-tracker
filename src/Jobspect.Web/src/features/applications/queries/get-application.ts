import "server-only";

import { cache } from "react";

import { api } from "@/server/api/client";
import { requireSession, UpstreamError } from "@/server/dal";
import { callAuthenticated } from "@/server/session/call";

import { toApplicationDetail, type ApplicationDetail } from "../application-detail";

/**
 * One application, or null when there is none to read.
 *
 * Null covers exactly one failure - the 404 - and the route answers it with
 * `notFound()`. An application belonging to somebody else answers 404 too, by
 * design on both sides of the wire: another user's resource is absent, not
 * denied, so nothing on this path can say "you don't have permission" because
 * nothing on this path knows there is anything to be denied.
 *
 * Everything else throws. A screen that cannot read its subject has nothing to
 * degrade into, and the route's error boundary offers the retry that a transient
 * API failure actually needs.
 *
 * Memoised for the render pass because `generateMetadata` and the page both want
 * it. Next dedupes `fetch`, and this does not go through `fetch` directly - the
 * client wraps it - so the memo is what stops the second call.
 */
export const getApplication = cache(async (id: string): Promise<ApplicationDetail | null> => {
  const session = await requireSession();

  const result = await callAuthenticated(session.sid, (init) =>
    api.GET("/api/v1/applications/{id}", { ...init, params: { path: { id } } }),
  );

  if (!result.ok) {
    if (result.failure.kind === "not-found") return null;
    throw new UpstreamError(result.failure.kind);
  }

  return toApplicationDetail(result.data);
});
