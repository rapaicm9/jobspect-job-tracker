import "server-only";

import { api } from "@/server/api/client";
import { requireSession } from "@/server/dal";
import { callAuthenticated } from "@/server/session/call";

import { toActivityEntry, type ActivityEntry } from "../to-activity-entry";

/**
 * Its own size rather than the list's `PAGE_SIZE`.
 *
 * The same number today, and that is fine - a timeline's page has no reason to
 * follow a table's, and sharing the constant would make changing one change the
 * other by accident.
 */
export const ACTIVITY_PAGE_SIZE = 25;

export interface ActivityPage {
  entries: ActivityEntry[];
  nextCursor: string | null;
}

/**
 * A page of one application's history, newest first.
 *
 * There is no reset case here, and its absence is deliberate. The list's walk can
 * be invalidated because its order is the user's to change; this one has a single
 * order and no filters, so nothing can move under it - and `cursor.sort_mismatch`
 * is raised by the applications list handler alone. Wiring `CursorResetError` in
 * would be a guard against something the endpoint cannot answer.
 */
export type ActivityRead = { kind: "page"; page: ActivityPage } | { kind: "failed" };

export async function listActivity(
  applicationId: string,
  cursor: string | null = null,
): Promise<ActivityRead> {
  const session = await requireSession();

  const result = await callAuthenticated(session.sid, (init) =>
    api.GET("/api/v1/applications/{applicationId}/activity", {
      ...init,
      params: {
        path: { applicationId },
        query: {
          limit: ACTIVITY_PAGE_SIZE,
          ...(cursor !== null ? { cursor } : {}),
        },
      },
    }),
  );

  if (!result.ok) return { kind: "failed" };

  return {
    kind: "page",
    page: {
      entries: result.data.items.map(toActivityEntry),
      nextCursor: result.data.nextCursor,
    },
  };
}
