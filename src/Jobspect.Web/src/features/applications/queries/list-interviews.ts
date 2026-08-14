import "server-only";

import { api } from "@/server/api/client";
import { requireSession } from "@/server/dal";
import { callAuthenticated } from "@/server/session/call";

import { toInterview, type Interview } from "../interview";
import type { PanelRead } from "../panel-read";

/** The ceiling rather than the default, for the reason `list-contacts.ts` gives. */
const PANEL_LIMIT = 100;

/** The interviews scheduled against one application. */
export async function listApplicationInterviews(
  applicationId: string,
): Promise<PanelRead<Interview>> {
  const session = await requireSession();

  const result = await callAuthenticated(session.sid, (init) =>
    api.GET("/api/v1/applications/{applicationId}/interviews", {
      ...init,
      params: { path: { applicationId }, query: { limit: PANEL_LIMIT } },
    }),
  );

  if (!result.ok) return { kind: "failed" };

  return { kind: "loaded", items: result.data.items.map(toInterview) };
}
