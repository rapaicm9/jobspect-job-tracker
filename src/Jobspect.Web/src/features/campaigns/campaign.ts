/**
 * The view model, in its own file so the type is reachable without the query
 * that produces it.
 *
 * The query opens with `import 'server-only'`, and a barrel that re-exported it
 * would drag that into every Client Component importing anything from this
 * slice - which is a build failure rather than a lint one.
 */
export interface Campaign {
  id: string;
  name: string;
  isDefault: boolean;
}
