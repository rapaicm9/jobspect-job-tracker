"use client";

// A Client Component because it has to know the URL it is rewriting, and a
// layout never receives searchParams - so the header cannot read the scope on
// the server the way a page can.

import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

import { useCampaignScope } from "../use-campaign-scope";
import { isScopedPath } from "../scope";
import type { Campaign } from "../campaign";

export interface CampaignSwitcherProps {
  campaigns: Campaign[];
}

export function CampaignSwitcher({ campaigns }: CampaignSwitcherProps) {
  const pathname = usePathname();
  const [campaignId, setCampaignId, isPending] = useCampaignScope(campaigns);

  // Nothing to switch. Only creating a campaign is entitled, so most accounts
  // have exactly the one they were given, and a control over it would be a
  // choice with one option. Making another happens in Settings, which is where
  // the affordance for it belongs.
  if (campaigns.length < 2) return null;

  // On Reminders or Settings the scope means nothing, so the control that sets
  // it does not appear there either.
  if (!isScopedPath(pathname)) return null;

  return (
    <div className={cn("flex items-center gap-2", isPending && "opacity-60")}>
      <label htmlFor="campaign" className="text-sm text-muted-foreground">
        Campaign
      </label>

      {/* A native select rather than a styled menu: it is a short list of
          mutually exclusive contexts, and the platform control is keyboard
          accessible and screen-reader correct without any of that being written
          here. */}
      <select
        id="campaign"
        value={campaignId ?? ""}
        onChange={(event) => {
          void setCampaignId(event.target.value);
        }}
        className={cn(
          "h-(--control-height-md) min-h-(--target-min) rounded-lg border border-border bg-background px-2 text-sm text-foreground",
          "outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        )}
      >
        {campaigns.map((campaign) => (
          <option key={campaign.id} value={campaign.id}>
            {campaign.name}
          </option>
        ))}
      </select>
    </div>
  );
}
