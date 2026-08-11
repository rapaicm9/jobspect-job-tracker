import "server-only";

import { api } from "@/server/api/client";
import { requireSession } from "@/server/dal";
import { callAuthenticated } from "@/server/session/call";

import { toApplicationRow, type ApplicationRow } from "../to-application-row";

/**
 * The client's own page size rather than the server's default.
 *
 * The API defaults to 25 and caps at 100, but a default is not a promise - and
 * the infinite list asks for the same number on every page, so the number has to
 * be somewhere this side of the wire to be asked for twice.
 */
export const PAGE_SIZE = 25;

export interface ApplicationPage {
  rows: ApplicationRow[];
  /** Null means the walk is over. It is the only stop signal (§6.3). */
  nextCursor: string | null;
}

/**
 * The first page, in the API's default order - applied date, newest first.
 *
 * No sort is passed at all. The endpoint's default is exactly what this screen
 * wants, and naming it here would be a second place to change it when the
 * default moves.
 */
export async function listApplications(): Promise<ApplicationPage> {
  const session = await requireSession();

  const result = await callAuthenticated(session.sid, (init) =>
    api.GET("/api/v1/applications", { ...init, params: { query: { limit: PAGE_SIZE } } }),
  );

  if (!result.ok) {
    // The route's error boundary states this to the user. Throwing rather than
    // returning an empty page is the difference between "nothing yet" and "we
    // could not ask", which are not the same thing to somebody mid-search.
    throw new Error(`The applications list could not be read: ${result.failure.kind}.`);
  }

  return {
    rows: result.data.items.map(toApplicationRow),
    nextCursor: result.data.nextCursor,
  };
}
