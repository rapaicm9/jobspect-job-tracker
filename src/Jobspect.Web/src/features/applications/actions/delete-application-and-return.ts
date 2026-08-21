"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { withCampaignScope } from "@/features/campaigns";

import { requestDeletion, type DeleteApplicationResult } from "../delete-application";

const inputSchema = z.object({
  applicationId: z.string().min(1).max(64),
  /** The scope off the URL, so the way out lands on the list it came from. */
  campaignId: z.string().max(64).nullable(),
});

export type DeleteApplicationAndReturnInput = z.input<typeof inputSchema>;

/**
 * The detail view's intent: remove the application, then leave the page that was
 * showing it.
 *
 * **A second export rather than a flag on the first, and the leaving is the
 * whole reason.** Done from the browser it is a race the client loses often
 * enough to see: the action's own revalidation drops the current route from the
 * router cache, so Next re-fetches the page that has just stopped existing at
 * the same moment `router.replace` is trying to leave it, and which lands last
 * is a coin toss. A redirect raised here travels *in* the action's response, so
 * there is nothing for it to race.
 *
 * `redirect` throws, so nothing after it runs and the union it claims to return
 * is only ever a failure in practice. Declared honestly all the same: the caller
 * has to render the failures, and a signature saying `never` would be a lie
 * about the cases that do come back.
 *
 * The path is fixed here and only the campaign travels, so nothing the caller
 * sends can turn this into a redirect somewhere else.
 */
export async function deleteApplicationAndReturn(input: unknown): Promise<DeleteApplicationResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { kind: "failed" };

  const { applicationId, campaignId } = parsed.data;

  const result = await requestDeletion(applicationId);
  if (result.kind !== "deleted") return result;

  redirect(withCampaignScope("/applications", campaignId));
}
