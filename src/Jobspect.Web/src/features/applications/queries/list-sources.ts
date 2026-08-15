import "server-only";

import { api } from "@/server/api/client";
import { requireSession } from "@/server/dal";
import { callAuthenticated } from "@/server/session/call";

/**
 * One bounded page, not the whole account.
 *
 * A hundred is the API's cap and far more than enough: these are suggestions for
 * a free-text box, and the vocabulary a job search actually uses is a handful of
 * words repeated. There is no endpoint that aggregates them, so this is the
 * cheapest honest answer.
 */
const LIMIT = 100;

/**
 * The sources this account has already typed, for the box that offers them back.
 *
 * Scoped to whichever campaign is being looked at, and that is forced rather than
 * chosen: omitting `campaignId` does not mean "every campaign" - the API applies
 * the account's default - so there is no request that spans them. A source used
 * only in another campaign therefore will not be offered, which costs nothing
 * because the field is free text and typing it is always allowed.
 *
 * Never throws. A suggestion list that could take the form down with it would be
 * a worse trade than no suggestions at all.
 */
export async function listUsedSources(campaignId: string | null): Promise<string[]> {
  const session = await requireSession();

  const result = await callAuthenticated(session.sid, (init) =>
    api.GET("/api/v1/applications", {
      ...init,
      params: {
        query: {
          limit: LIMIT,
          ...(campaignId !== null ? { campaignId } : {}),
        },
      },
    }),
  );

  if (!result.ok) return [];

  const sources = new Set<string>();
  for (const item of result.data.items) {
    const source = item.source?.trim();
    if (source !== undefined && source !== "") sources.add(source);
  }

  return [...sources].sort((left, right) => left.localeCompare(right));
}
