import { formatInAccountZone } from "@/lib/instants";

import { describeEntry } from "../activity-reading";
import type { ActivityEntry } from "../to-activity-entry";

import { StageChip } from "./stage-chip";

export interface ActivityEntryRowProps {
  entry: ActivityEntry;
  timeZoneId: string | null;
}

/**
 * One line of history.
 *
 * The stages render as chips rather than as words in the sentence, so the
 * timeline reads the way the rest of the product does - and a chip carries its
 * own name, which is what keeps it legible to somebody who cannot use the colour.
 */
export function ActivityEntryRow({ entry, timeZoneId }: ActivityEntryRowProps) {
  const reading = describeEntry(entry);
  const when = formatInAccountZone(entry.occurredAt, timeZoneId);

  return (
    <li className="flex flex-col gap-1 border-l border-border py-2 pl-4">
      {reading.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-foreground">
          {reading.map((part, index) =>
            "stage" in part ? (
              <StageChip key={index} stage={part.stage} />
            ) : (
              <span key={index}>{part.text}</span>
            ),
          )}
        </p>
      )}

      {/* A note's text is the entry rather than a detail under a heading, which
          is why `describeEntry` gives it no sentence. */}
      {entry.note !== null && (
        <p className="text-sm whitespace-pre-line text-foreground">{entry.note}</p>
      )}

      {when !== null && (
        // In the account's zone, never the browser's.
        <time dateTime={entry.occurredAt} className="text-xs text-muted-foreground">
          {when}
        </time>
      )}
    </li>
  );
}
