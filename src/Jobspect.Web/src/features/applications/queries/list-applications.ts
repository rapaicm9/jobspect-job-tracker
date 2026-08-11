import "server-only";

import { api } from "@/server/api/client";
import { STAGES } from "@/server/api/enums";
import { requireSession } from "@/server/dal";
import { callAuthenticated } from "@/server/session/call";

import { DEFAULT_FILTERS, type ApplicationFilters } from "../filters";
import { toApplicationRow, type ApplicationRow } from "../to-application-row";

/**
 * The client's own page size rather than the server's default.
 *
 * The API defaults to 25 and caps at 100, but a default is not a promise - and
 * every page after the first asks for the same number, so it has to be a value
 * this side of the wire.
 */
export const PAGE_SIZE = 25;

export type ApplicationPage =
  | { kind: "page"; rows: ApplicationRow[]; nextCursor: string | null }
  /**
   * The cursor no longer describes this list. ADR 0008 invalidates one in flight
   * when the order changes, and the answer is to walk again from the top rather
   * than to tell the user something they did not do went wrong.
   */
  | { kind: "reset" }
  | { kind: "failed" };

/**
 * Unknown stages are dropped rather than forwarded.
 *
 * The URL is user input, and the client parses `stage` as plain strings because
 * the union lives behind `server-only`. Sending an unrecognised value on would
 * turn a typo in a query string into a 422 the user cannot act on; ignoring it
 * shows them the list they can have.
 */
function knownStages(stage: readonly string[]): string[] {
  const known: ReadonlySet<string> = new Set(STAGES);
  return stage.filter((value) => known.has(value));
}

export interface ListApplicationsOptions {
  filters?: ApplicationFilters;
  cursor?: string | null;
}

export async function listApplications({
  filters = DEFAULT_FILTERS,
  cursor = null,
}: ListApplicationsOptions = {}): Promise<ApplicationPage> {
  const session = await requireSession();

  const stage = knownStages(filters.stage);

  const result = await callAuthenticated(session.sid, (init) =>
    api.GET("/api/v1/applications", {
      ...init,
      params: {
        query: {
          limit: PAGE_SIZE,
          // Both or neither: the endpoint refuses a direction with nothing to
          // order by, and it names that error after the parameter it is missing.
          sortBy: filters.sortBy,
          sortDirection: filters.sortDirection,
          // Omitted entirely when empty. An empty repeated parameter is not the
          // same request as an absent one, and only one of them means "every
          // stage".
          ...(stage.length > 0 ? { stage } : {}),
          ...(cursor !== null ? { cursor } : {}),
        },
      },
    }),
  );

  if (!result.ok) {
    return result.failure.kind === "cursor-reset" ? { kind: "reset" } : { kind: "failed" };
  }

  return {
    kind: "page",
    rows: result.data.items.map(toApplicationRow),
    nextCursor: result.data.nextCursor,
  };
}

/**
 * The first page, for the Server Component that renders it.
 *
 * Throws where the paged read returns, because the two failures mean different
 * things at this point: the route's error boundary is the right answer for a
 * first page nobody can read, and there is no earlier page to fall back to.
 */
export async function listFirstPage(
  filters: ApplicationFilters,
): Promise<{ rows: ApplicationRow[]; nextCursor: string | null }> {
  const page = await listApplications({ filters });

  if (page.kind !== "page") {
    throw new Error(`The applications list could not be read: ${page.kind}.`);
  }

  return { rows: page.rows, nextCursor: page.nextCursor };
}
