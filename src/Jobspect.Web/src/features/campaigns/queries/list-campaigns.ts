import "server-only";

import { cache } from "react";

import { api } from "@/server/api/client";
import { verifySession } from "@/server/dal";
import { callAuthenticated } from "@/server/session/call";

import type { Campaign } from "../campaign";

/**
 * Every campaign on the account, for the header.
 *
 * Memoised for the render pass because two things read it - the switcher and the
 * palette - and one call is enough for both. It is not memoised across requests:
 * there is no cache layer here, so the shell pays one small call per
 * authenticated navigation, which is the cost of the control being global.
 *
 * Answers an empty list rather than throwing when the session or the API is not
 * there. A header that cannot list campaigns should render without a switcher,
 * not take down the page around it.
 */
export const listCampaigns = cache(async (): Promise<Campaign[]> => {
  const state = await verifySession();
  if (state.status !== "active") return [];

  const result = await callAuthenticated(state.session.sid, (init) =>
    api.GET("/api/v1/campaigns", init),
  );

  if (!result.ok) return [];

  return result.data.map((campaign) => ({
    id: campaign.id,
    name: campaign.name,
    isDefault: campaign.isDefault,
  }));
});
