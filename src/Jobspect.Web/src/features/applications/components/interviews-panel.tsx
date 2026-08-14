import { formatInAccountZone } from "@/lib/instants";

import type { Interview } from "../interview";
import type { PanelRead } from "../panel-read";

import { DetailPanel, PanelNote, PanelUnavailable } from "./detail-panel";

/** "Phone screen · Remote · Passed", skipping anything the API did not name. */
function describe(interview: Interview): string {
  return [interview.type, interview.format, interview.outcome]
    .filter((part) => part !== null)
    .join(" · ");
}

export interface InterviewsPanelProps {
  interviews: PanelRead<Interview>;
  timeZoneId: string | null;
}

/**
 * Read-only. There is no DELETE on this resource, so the panel must never grow
 * one; create and edit arrive with their forms.
 *
 * The order is the API's - by scheduled instant, ascending - and is not sorted
 * again here. A panel that reordered what the endpoint returned would disagree
 * with the page it is paged by.
 */
export function InterviewsPanel({ interviews, timeZoneId }: InterviewsPanelProps) {
  return (
    <DetailPanel title="Interviews">
      {interviews.kind === "failed" ? (
        <PanelUnavailable subject="Interviews" />
      ) : interviews.items.length === 0 ? (
        <PanelNote>None scheduled.</PanelNote>
      ) : (
        <ul className="flex flex-col gap-3">
          {interviews.items.map((interview) => {
            const when = formatInAccountZone(interview.scheduledAt, timeZoneId);
            const summary = describe(interview);

            return (
              <li key={interview.id} className="space-y-0.5">
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
              </li>
            );
          })}
        </ul>
      )}
    </DetailPanel>
  );
}
