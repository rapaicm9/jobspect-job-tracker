import "server-only";

import { api } from "@/server/api/client";
import { requireSession } from "@/server/dal";
import { callAuthenticated } from "@/server/session/call";

import { toContact, type Contact } from "../contact";
import type { PanelRead } from "../panel-read";

/**
 * The panel asks for the ceiling rather than the default.
 *
 * A read-only panel has nowhere to put a "load more", and an application with
 * more than a hundred contacts on it is not a case this product has. Asking for
 * the whole set once is honest about that; paging a panel nobody can page would
 * quietly show a prefix and call it the list.
 */
const PANEL_LIMIT = 100;

/** The contacts recorded against one application. */
export async function listApplicationContacts(applicationId: string): Promise<PanelRead<Contact>> {
  const session = await requireSession();

  const result = await callAuthenticated(session.sid, (init) =>
    api.GET("/api/v1/contacts", {
      ...init,
      params: { query: { applicationId, limit: PANEL_LIMIT } },
    }),
  );

  if (!result.ok) return { kind: "failed" };

  // `nextCursor` is discarded on purpose - see PANEL_LIMIT above.
  return { kind: "loaded", items: result.data.items.map(toContact) };
}
