import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/ui/table";

import type { ApplicationRow } from "../to-application-row";
import { isColumnVisible, type ViewPreferences } from "../view-preferences";

import { StageChip } from "./stage-chip";

/** A cell the API had nothing for. The dash is for the eye; a blank cell already
 * reads as blank to a screen reader, and "em dash" read aloud is noise. */
function Absent() {
  return <span aria-hidden="true">—</span>;
}

function DateCell({ value }: { value: string | null }) {
  const label = formatDate(value);
  if (value === null || label === null) return <Absent />;

  // The machine-readable value beside the human one, which is the whole reason
  // the row carries both.
  return <time dateTime={value}>{label}</time>;
}

export interface ApplicationsTableProps {
  rows: ApplicationRow[];
  preferences: ViewPreferences;
}

/**
 * The wide layout. Its narrow counterpart renders the same rows as cards, and
 * CSS picks exactly one - so only one is ever in the accessibility tree.
 */
export function ApplicationsTable({ rows, preferences }: ApplicationsTableProps) {
  const showWorkMode = isColumnVisible(preferences, "workMode");
  const showLocation = isColumnVisible(preferences, "location");

  const rowHeight =
    preferences.density === "compact" ? "h-(--row-height-compact)" : "h-(--row-height-comfortable)";

  return (
    <div className="hidden md:block">
      <Table aria-label="Applications">
        <TableHeader>
          <TableRow>
            {/* scope is not decoration: without it a screen reader cannot tell
                which header belongs to the cell it is reading. */}
            <TableHead scope="col">Role</TableHead>
            <TableHead scope="col">Company</TableHead>
            <TableHead scope="col">Stage</TableHead>
            <TableHead scope="col">Applied</TableHead>
            <TableHead scope="col">Deadline</TableHead>
            <TableHead scope="col">Source</TableHead>
            <TableHead scope="col">Compensation</TableHead>
            {showWorkMode && <TableHead scope="col">Work mode</TableHead>}
            {showLocation && <TableHead scope="col">Location</TableHead>}
          </TableRow>
        </TableHeader>

        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id} className={cn(rowHeight)}>
              <TableCell className="font-medium text-foreground">{row.role}</TableCell>
              <TableCell>{row.companyName ?? <Absent />}</TableCell>
              <TableCell>
                <StageChip stage={row.stage} />
              </TableCell>
              <TableCell>
                <DateCell value={row.appliedDate} />
              </TableCell>
              <TableCell>
                <DateCell value={row.applicationDeadline} />
              </TableCell>
              <TableCell>{row.source ?? <Absent />}</TableCell>
              <TableCell className="tabular-nums">
                {formatMoney(row.compensation) ?? <Absent />}
              </TableCell>
              {showWorkMode && <TableCell>{row.workMode ?? <Absent />}</TableCell>}
              {showLocation && <TableCell>{row.location ?? <Absent />}</TableCell>}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
