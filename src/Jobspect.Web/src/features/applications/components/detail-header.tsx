import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { withCampaignScope } from "@/features/campaigns";
import { formatDate } from "@/lib/dates";

import type { ApplicationDetail } from "../application-detail";

import { StageChip } from "./stage-chip";

export interface DetailHeaderProps {
  application: ApplicationDetail;
  /** The raw scope off the URL, so the way back lands on the list it came from. */
  campaignId: string | null;
  /**
   * The transition menu, once there is one. Present as a slot rather than added
   * later so the header's layout is settled by the commit that builds it.
   */
  actions?: React.ReactNode;
}

export function DetailHeader({ application, campaignId, actions }: DetailHeaderProps) {
  const deadline = formatDate(application.applicationDeadline);

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={withCampaignScope("/applications", campaignId)}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        All applications
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {application.role}
          </h1>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {application.companyName !== null && (
              <p className="text-muted-foreground">{application.companyName}</p>
            )}
            <StageChip stage={application.stage} />
            {deadline !== null && application.applicationDeadline !== null && (
              <p className="text-sm text-muted-foreground">
                Closes <time dateTime={application.applicationDeadline}>{deadline}</time>
              </p>
            )}
          </div>
        </div>

        {actions}
      </div>
    </div>
  );
}
