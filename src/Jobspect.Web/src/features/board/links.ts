import { withCampaignScope } from "@/features/campaigns";
import { TERMINAL_STAGES } from "@/lib/enums";

/**
 * The two places the board hands off to the list.
 *
 * Both are stage filters in the list's own URL vocabulary, which is one
 * comma-joined parameter rather than a repeated one - `parseAsArrayOf` reads
 * `?stage=Applied,Offer`, and `?stage=Applied&stage=Offer` is a different thing
 * it does not read. `links.test.ts` loads these back through the list's own
 * parsers rather than asserting the string, so a change to the separator breaks
 * here instead of silently producing a link that filters nothing.
 *
 * Both go through `withCampaignScope`, because a link that dropped the scope
 * would send someone reading one job search to a list of all of them.
 */

const SEPARATOR = ",";

/** Everything in one active stage, for a column showing only part of it. */
export function stageListHref(stage: string, campaignId: string | null): string {
  return withCampaignScope(`/applications?stage=${encodeURIComponent(stage)}`, campaignId);
}

/**
 * The closed applications, which the board deliberately holds no column for
 * (ADR 0001). This link is the only route to them.
 */
export function closedListHref(campaignId: string | null): string {
  const stages = TERMINAL_STAGES.join(SEPARATOR);

  return withCampaignScope(`/applications?stage=${encodeURIComponent(stages)}`, campaignId);
}
