import { Plus } from "lucide-react";
import Link from "next/link";

import { withCampaignScope } from "@/features/campaigns";
import { Button } from "@/ui/button";

export interface AddApplicationButtonProps {
  /** Carried through, so an application opens in the campaign being looked at. */
  campaignId: string | null;
}

/**
 * The one affordance that makes this product usable, on every screen that has a
 * reason to offer it.
 *
 * A link rather than a button opening something, which is what makes it cheap to
 * put in three places: the list, the board and the command palette all reach the
 * same route with no shared state between them.
 */
export function AddApplicationButton({ campaignId }: AddApplicationButtonProps) {
  return (
    <Button
      size="sm"
      render={
        <Link href={withCampaignScope("/applications/new", campaignId)}>
          <Plus aria-hidden="true" className="size-4" />
          Add application
        </Link>
      }
    />
  );
}
