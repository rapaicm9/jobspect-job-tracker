import { formatDate } from "@/lib/dates";
import { formatInAccountZone } from "@/lib/instants";
import { formatMoney } from "@/lib/money";

import type { ApplicationDetail } from "../application-detail";

import { DetailPanel } from "./detail-panel";

/**
 * Only the facts this application has.
 *
 * The opposite of the table, where a column has to keep its shape whether or not
 * a row filled it in. A page is read one at a time, so a grid of dashes costs
 * more than it explains.
 */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">{children}</dd>
    </div>
  );
}

function DateFact({ label, value }: { label: string; value: string | null }) {
  const formatted = formatDate(value);
  if (value === null || formatted === null) return null;

  // The machine-readable value beside the human one, which is why the view model
  // keeps the raw string.
  return (
    <Fact label={label}>
      <time dateTime={value}>{formatted}</time>
    </Fact>
  );
}

function InstantFact({
  label,
  value,
  timeZoneId,
}: {
  label: string;
  value: string | null;
  timeZoneId: string | null;
}) {
  const formatted = formatInAccountZone(value, timeZoneId);
  if (value === null || formatted === null) return null;

  return (
    <Fact label={label}>
      <time dateTime={value}>{formatted}</time>
    </Fact>
  );
}

export interface DetailFactsProps {
  application: ApplicationDetail;
  /** Null when the account has no campaign by that id, which a stale link can do. */
  campaignName: string | null;
  timeZoneId: string | null;
}

export function DetailFacts({ application, campaignName, timeZoneId }: DetailFactsProps) {
  const compensation = formatMoney(application.compensation);

  return (
    <DetailPanel title="Details">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
        {campaignName !== null && <Fact label="Campaign">{campaignName}</Fact>}
        <DateFact label="Applied" value={application.appliedDate} />
        <DateFact label="Application deadline" value={application.applicationDeadline} />
        {/* Only meaningful once there is an offer, and the API only lets it be
            set then - so its presence is the signal rather than the stage. */}
        <DateFact label="Offer decision by" value={application.offerDecisionDeadline} />
        {application.source !== null && <Fact label="Source">{application.source}</Fact>}
        {compensation !== null && (
          <Fact label="Compensation">
            <span className="tabular-nums">{compensation}</span>
          </Fact>
        )}
        {application.location !== null && <Fact label="Location">{application.location}</Fact>}
        {application.workMode !== null && <Fact label="Work mode">{application.workMode}</Fact>}
        {application.cvLabel !== null && <Fact label="CV">{application.cvLabel}</Fact>}
        {application.coverLetterLabel !== null && (
          <Fact label="Cover letter">{application.coverLetterLabel}</Fact>
        )}
        {application.postingUrl !== null && (
          <Fact label="Posting">
            {/* noreferrer alongside noopener: the job board has no business
                knowing which application was open when the link was followed. */}
            <a
              href={application.postingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all underline underline-offset-4 hover:text-muted-foreground"
            >
              {application.postingUrl}
            </a>
          </Fact>
        )}
        <InstantFact label="Added" value={application.createdAt} timeZoneId={timeZoneId} />
        <InstantFact label="Last updated" value={application.updatedAt} timeZoneId={timeZoneId} />
      </dl>
    </DetailPanel>
  );
}
