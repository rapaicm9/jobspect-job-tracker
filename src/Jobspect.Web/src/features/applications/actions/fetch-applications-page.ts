"use server";

import { z } from "zod";

import { STAGES } from "@/server/api/enums";

import { SORT_DIRECTIONS, SORT_KEYS } from "../filters";
import { listApplications, type ApplicationPage } from "../queries/list-applications";

/**
 * Every `'use server'` export is a public endpoint: the identifier is a hash of
 * the source location, and anyone holding it can call this with any argument at
 * all. So the input is parsed rather than trusted, and `listApplications`
 * re-verifies the session on the other side of it.
 *
 * A cursor is opaque to this client - the API encodes and reads it - so the only
 * thing worth asserting is that it is a string of a sane length. Anything else
 * is the API's to refuse.
 */
const inputSchema = z.object({
  filters: z.object({
    // Bounded by the number of stages that exist. Selecting all of them is the
    // same request as selecting none, so anything longer is not a filter.
    stage: z.array(z.string().max(50)).max(STAGES.length),
    sortBy: z.enum(SORT_KEYS),
    sortDirection: z.enum(SORT_DIRECTIONS),
  }),
  cursor: z.string().min(1).max(512).nullable(),
});

export type FetchApplicationsPageInput = z.input<typeof inputSchema>;

/**
 * The paging read, called from `useInfiniteQuery` rather than rendered.
 *
 * A Server Action rather than a Route Handler because the browser holds no token
 * and this needs the session: an action compares Origin to Host and is POST-only
 * on its own, where a route handler gets neither and would need that written by
 * hand (§9).
 *
 * It returns its failures rather than throwing them. Next replaces a thrown
 * server error with a generic message and a digest, so a class thrown here
 * arrives at the client as something it cannot tell apart from any other
 * failure - and telling a stale cursor apart from a real one is the whole point.
 */
export async function fetchApplicationsPage(input: unknown): Promise<ApplicationPage> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { kind: "failed" };

  return listApplications(parsed.data);
}
