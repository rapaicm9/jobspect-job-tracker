import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

import type { ApplicationRow } from "../to-application-row";
import { isColumnVisible, type ViewPreferences } from "../view-preferences";

import { ApplicationLink } from "./application-link";
import { StageChip } from "./stage-chip";

/**
 * The same rows below 768px.
 *
 * A different layout rather than a horizontal scrollbar: nine columns on a phone
 * means either scrolling sideways through the primary screen of the product or
 * reading four-character truncations, and neither is a list.
 */

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right text-foreground">{children}</dd>
    </div>
  );
}

function DateFact({ label, value }: { label: string; value: string | null }) {
  const formatted = formatDate(value);
  if (value === null || formatted === null) return null;

  return (
    <Fact label={label}>
      <time dateTime={value}>{formatted}</time>
    </Fact>
  );
}

export interface ApplicationCardsProps {
  rows: ApplicationRow[];
  preferences: ViewPreferences;
}

export function ApplicationCards({ rows, preferences }: ApplicationCardsProps) {
  const compensation = (row: ApplicationRow) => formatMoney(row.compensation);

  return (
    // A list, and announced as one: the table it replaces carried its structure
    // in its markup, and a stack of divs would lose the count on the way.
    <ul
      aria-label="Applications"
      className={cn(
        "flex flex-col md:hidden",
        preferences.density === "compact" ? "gap-2" : "gap-3",
      )}
    >
      {rows.map((row) => (
        <li
          key={row.id}
          className={cn(
            "rounded-lg border border-border bg-card",
            preferences.density === "compact" ? "p-3" : "p-4",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {/* The role rather than the whole card, matching the table: one
                  link per row, and the link text names where it goes. */}
              <p className="font-medium text-foreground">
                <ApplicationLink id={row.id} className="underline-offset-4 hover:underline">
                  {row.role}
                </ApplicationLink>
              </p>
              {row.companyName !== null && (
                <p className="text-sm text-muted-foreground">{row.companyName}</p>
              )}
            </div>
            <StageChip stage={row.stage} />
          </div>

          {/* Only the facts this application has. A card is read one at a time,
              so a column of dashes costs more than it explains - which is the
              opposite of the table, where the column has to keep its shape. */}
          <dl className="mt-3 flex flex-col gap-1 text-sm">
            <DateFact label="Applied" value={row.appliedDate} />
            <DateFact label="Deadline" value={row.applicationDeadline} />
            {row.source !== null && <Fact label="Source">{row.source}</Fact>}
            {compensation(row) !== null && (
              <Fact label="Compensation">
                <span className="tabular-nums">{compensation(row)}</span>
              </Fact>
            )}
            {isColumnVisible(preferences, "workMode") && row.workMode !== null && (
              <Fact label="Work mode">{row.workMode}</Fact>
            )}
            {isColumnVisible(preferences, "location") && row.location !== null && (
              <Fact label="Location">{row.location}</Fact>
            )}
          </dl>
        </li>
      ))}
    </ul>
  );
}
