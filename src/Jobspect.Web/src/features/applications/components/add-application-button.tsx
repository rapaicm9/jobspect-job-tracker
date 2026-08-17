import { Plus } from "lucide-react";
import Link from "next/link";

import { withCampaignScope } from "@/features/campaigns";
import { buttonVariants } from "@/ui/button";

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
 *
 * Styled with `buttonVariants` rather than wrapped in `Button`, and the
 * difference is semantics rather than taste. Base UI's button asserts it is
 * rendering a native `<button>` and warns when the `render` prop hands it an
 * anchor; telling it otherwise with `nativeButton={false}` makes it stamp
 * `role="button"` on that anchor, which announces a link as a button and takes
 * away open-in-new-tab along with it. What is wanted here is a link that looks
 * like a button, so only the looks are borrowed.
 */
export function AddApplicationButton({ campaignId }: AddApplicationButtonProps) {
  return (
    <Link
      href={withCampaignScope("/applications/new", campaignId)}
      className={buttonVariants({ size: "sm" })}
    >
      <Plus aria-hidden="true" className="size-4" />
      Add application
    </Link>
  );
}
