"use client";

import { useQueryState } from "nuqs";
import { useTransition } from "react";

import type { Campaign } from "./campaign";
import { campaignScopeOptions, campaignScopeParsers } from "./scope";

/**
 * Reading and writing the campaign scope, shared by the switcher and the palette
 * so both go through one mechanism and one set of options.
 *
 * An absent parameter means the default campaign, which is what a fresh account
 * and a shared link with no scope on it both look like. Reporting that as the
 * default's id rather than as null is what lets a control show which context it
 * is in without the URL having to spell it out.
 */
export function useCampaignScope(
  campaigns: Campaign[],
): [string | null, (id: string) => Promise<URLSearchParams>, boolean] {
  const [isPending, startTransition] = useTransition();

  const [campaignId, setCampaignId] = useQueryState("campaignId", {
    ...campaignScopeParsers.campaignId,
    ...campaignScopeOptions,
    startTransition,
  });

  const resolved = campaignId ?? campaigns.find((campaign) => campaign.isDefault)?.id ?? null;

  return [resolved, setCampaignId, isPending];
}
