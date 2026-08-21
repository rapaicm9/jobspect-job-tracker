import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/ui/table";

import type { ApplicationRow } from "../to-application-row";
import { isColumnVisible, type ViewPreferences } from "../view-preferences";

import { ApplicationLink } from "./application-link";
import { DeleteRowButton } from "./delete-row-button";
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
  /** Called once a row's delete has been confirmed by the server. */
  onDeleted: (id: string) => void;
}

/**
 * The wide layout. Its narrow counterpart renders the same rows as cards, and
 * CSS picks exactly one - so only one is ever in the accessibility tree.
 */
export function ApplicationsTable({ rows, preferences, onDeleted }: ApplicationsTableProps) {
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
            {/* Named for a screen reader even though the column shows nothing:
                a header cell with no accessible name leaves the cells under it
                announced against an empty string. */}
            <TableHead scope="col">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id} className={cn(rowHeight)}>
              {/* One link per row, on the one cell that names the destination.
                  A whole-row target would make every other cell unselectable and
                  leave a screen reader announcing nine columns as the link. */}
              <TableCell className="font-medium text-foreground">
                <ApplicationLink id={row.id} className="underline-offset-4 hover:underline">
                  {row.role}
                </ApplicationLink>
              </TableCell>
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
              {/* `py-0`, or this cell decides the row height. A 28px control
                  inside the default 8px vertical padding needs 44px, which is
                  exactly the comfortable row - so compact would stop being
                  shorter than comfortable and the density control would appear
                  to do nothing. The button still fits the 32px compact row. */}
              <TableCell className="py-0 text-right">
                <DeleteRowButton
                  applicationId={row.id}
                  role={row.role}
                  onDeleted={() => {
                    onDeleted(row.id);
                  }}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
