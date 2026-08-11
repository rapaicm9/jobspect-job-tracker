import "server-only";

import { cookies } from "next/headers";

import { parseViewPreferences, VIEW_COOKIE, type ViewPreferences } from "../view-preferences";

/** The request-scoped half: everything about what the value means is pure. */
export async function readViewPreferences(): Promise<ViewPreferences> {
  const store = await cookies();

  return parseViewPreferences(store.get(VIEW_COOKIE)?.value);
}
