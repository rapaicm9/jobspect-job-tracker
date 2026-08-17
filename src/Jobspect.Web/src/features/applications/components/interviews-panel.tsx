import { formatInAccountZone } from "@/lib/instants";

import {
  INTERVIEW_FORMAT_LABELS,
  INTERVIEW_OUTCOME_LABELS,
  INTERVIEW_TYPE_LABELS,
  type Interview,
} from "../interview";
import type { PanelRead } from "../panel-read";

import { DetailPanel, PanelNote, PanelUnavailable } from "./detail-panel";
import { InterviewDialog } from "./interview-dialog";

/** "Phone screen · Remote · Passed", skipping anything the API did not name. */
function describe(interview: Interview): string {
  return [
    interview.type === null ? null : INTERVIEW_TYPE_LABELS[interview.type],
    interview.format === null ? null : INTERVIEW_FORMAT_LABELS[interview.format],
    interview.outcome === null ? null : INTERVIEW_OUTCOME_LABELS[interview.outcome],
  ]
    .filter((part) => part !== null)
    .join(" · ");
}

export interface InterviewsPanelProps {
  applicationId: string;
  interviews: PanelRead<Interview>;
  timeZoneId: string | null;
}

/**
 * There is no DELETE on this resource, so the panel must never grow one. A round
 * that is not happening is one whose outcome is Cancelled, which is also what
 * retracts the reminders standing against it.
 *
 * The order is the API's - by scheduled instant, ascending - and is not sorted
 * again here. A panel that reordered what the endpoint returned would disagree
 * with the page it is paged by.
 */
export function InterviewsPanel({ applicationId, interviews, timeZoneId }: InterviewsPanelProps) {
  return (
    <DetailPanel
      title="Interviews"
      action={
        // Nothing to add against when the read failed: the panel could not show
        // the round afterwards either, so the write would look like it did
        // nothing at all.
        interviews.kind === "failed" ? undefined : (
          <InterviewDialog applicationId={applicationId} interview={null} timeZoneId={timeZoneId} />
        )
      }
    >
      {interviews.kind === "failed" ? (
        <PanelUnavailable subject="Interviews" />
      ) : interviews.items.length === 0 ? (
        <PanelNote>None scheduled.</PanelNote>
      ) : (
        <ul aria-label="Interviews" className="flex flex-col gap-3">
          {interviews.items.map((interview) => {
            const when = formatInAccountZone(interview.scheduledAt, timeZoneId);
            const summary = describe(interview);

            return (
              <li key={interview.id} className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  {/* In the account's zone, not the browser's: the backend computes
                      this interview's reminders from the account's zone, and a
                      screen reading any other one shows a time nothing fires at. */}
                  <p className="text-sm font-medium text-foreground">
                    {when === null ? (
                      "Scheduled"
                    ) : (
                      <time dateTime={interview.scheduledAt}>{when}</time>
                    )}
                  </p>
                  {summary !== "" && <p className="text-xs text-muted-foreground">{summary}</p>}
                  {interview.notes !== null && (
                    <p className="text-sm whitespace-pre-line text-muted-foreground">
                      {interview.notes}
                    </p>
                  )}
                </div>

                <InterviewDialog
                  applicationId={applicationId}
                  interview={interview}
                  timeZoneId={timeZoneId}
                  subject={when === null ? "this interview" : `interview on ${when}`}
                />
              </li>
            );
          })}
        </ul>
      )}
    </DetailPanel>
  );
}
