import "server-only";

import { createSearchParamsCache } from "nuqs/server";

import { filterParsers } from "../filters";

/**
 * The server half of the URL state, over the same parsers the client writes
 * with - so what the address bar says and what the first page was fetched for
 * cannot drift.
 *
 * `parse` has to be called by the page before any Server Component reads from
 * the cache; nothing below it can populate it.
 */
export const applicationsSearchParams = createSearchParamsCache(filterParsers);
