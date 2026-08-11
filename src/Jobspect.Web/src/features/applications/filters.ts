import { parseAsArrayOf, parseAsString, parseAsStringLiteral } from "nuqs/server";

/**
 * What the URL owns: what is being looked at, and nothing about how.
 *
 * Filters and sort go here so a link carries them. The cursor never does - a
 * keyset cursor is a position in a walk rather than a page number, and a link to
 * one means nothing to anybody whose list has moved since. Row density and
 * columns are the mirror image and live in a cookie: nobody wants to send
 * someone a link that also changes their row height.
 */

/** What the endpoint will order by. Role and stage are deliberately absent. */
export const SORT_KEYS = ["appliedDate", "applicationDeadline"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export const SORT_DIRECTIONS = ["desc", "asc"] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

/** The API's own default, restated so the client and the URL agree on it. */
export const DEFAULT_SORT: SortKey = "appliedDate";
export const DEFAULT_DIRECTION: SortDirection = "desc";

/**
 * Parsed from `nuqs/server` rather than the client entry: these definitions are
 * imported by both sides and have to be the same objects, which is the shape the
 * library's own guidance takes.
 *
 * `stage` is parsed as plain strings rather than against the stage union,
 * because the union lives behind `server-only` and a client component cannot
 * import it. Nothing is lost: the query narrows unknown values away before the
 * request goes out, so junk in the URL is ignored rather than sent on to be
 * refused.
 */
export const filterParsers = {
  stage: parseAsArrayOf(parseAsString).withDefault([]),
  sortBy: parseAsStringLiteral(SORT_KEYS).withDefault(DEFAULT_SORT),
  sortDirection: parseAsStringLiteral(SORT_DIRECTIONS).withDefault(DEFAULT_DIRECTION),
};

export interface ApplicationFilters {
  stage: string[];
  sortBy: SortKey;
  sortDirection: SortDirection;
}

export const DEFAULT_FILTERS: ApplicationFilters = {
  stage: [],
  sortBy: DEFAULT_SORT,
  sortDirection: DEFAULT_DIRECTION,
};

/**
 * The cache key, and it has to carry every filter.
 *
 * ADR 0008 invalidates a cursor in flight when the order changes, so two filter
 * sets sharing a key would hand the second one the first one's cursor - which
 * the API answers with a sort mismatch. Starting a new walk on any change is
 * required rather than tidy.
 */
export function applicationsQueryKey(filters: ApplicationFilters): readonly unknown[] {
  return ["applications", [...filters.stage].sort(), filters.sortBy, filters.sortDirection];
}
