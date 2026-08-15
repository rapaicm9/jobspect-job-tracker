"use server";

import { z } from "zod";

import { listUsedSources } from "../queries/list-sources";

const inputSchema = z.object({ campaignId: z.string().max(64).nullable() });

/**
 * The sources to offer, fetched when the form opens rather than with the page.
 *
 * Called from the click that opens the editor, which is what keeps it off every
 * detail view: most visits read an application and never edit it, and a hundred
 * rows read for a datalist nobody will see is a round trip spent on nothing.
 *
 * An event handler, not an effect - fetching in `useEffect` is the thing this
 * client does not do, and opening a form is a user's action rather than a
 * consequence of rendering.
 *
 * Answers with an empty list on any failure, because the field degrades to an
 * ordinary text box and the user loses nothing they cannot type.
 */
export async function fetchSourceSuggestions(input: unknown): Promise<string[]> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return [];

  return listUsedSources(parsed.data.campaignId);
}
