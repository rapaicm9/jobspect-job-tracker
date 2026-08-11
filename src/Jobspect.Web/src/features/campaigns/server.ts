/**
 * The slice's server surface, named rather than reached into.
 *
 * It is separate from `index.ts` because that barrel is imported by Client
 * Components - the palette needs the scope hook, and the applications filters
 * need the parser. A barrel that also re-exported the query would pull
 * `server-only` into a client bundle and fail the build, so the two entries are
 * split by which side of the boundary can import them rather than by taste.
 */
export { listCampaigns } from "./queries/list-campaigns";
