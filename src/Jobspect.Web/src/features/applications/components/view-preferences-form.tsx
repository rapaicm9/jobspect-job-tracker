import { Button } from "@/ui/button";

import { setViewPreferences } from "../actions/set-view-preferences";
import {
  DENSITIES,
  isColumnVisible,
  OPTIONAL_COLUMNS,
  type ViewPreferences,
} from "../view-preferences";

const DENSITY_LABEL: Record<(typeof DENSITIES)[number], string> = {
  comfortable: "Comfortable",
  compact: "Compact",
};

const COLUMN_LABEL: Record<(typeof OPTIONAL_COLUMNS)[number], string> = {
  workMode: "Work mode",
  location: "Location",
};

/**
 * Both controls, one form, no client component.
 *
 * Every control is a submit button carrying its own value, so a change is one
 * click rather than a change plus an Apply - and the whole screen still works
 * with JavaScript off. A preference somebody sets once does not need to dodge a
 * round trip.
 */
export function ViewPreferencesForm({ preferences }: { preferences: ViewPreferences }) {
  return (
    <form action={setViewPreferences} className="flex flex-wrap items-center gap-x-6 gap-y-3">
      <fieldset className="flex items-center gap-2">
        <legend className="sr-only">Row density</legend>
        <span className="text-sm text-muted-foreground" aria-hidden="true">
          Density
        </span>

        {DENSITIES.map((density) => (
          <Button
            key={density}
            type="submit"
            name="density"
            value={density}
            size="sm"
            variant={preferences.density === density ? "secondary" : "ghost"}
            // The state a screen reader gets. The variant above is the same fact
            // for anyone who can see it, and neither is the only telling.
            aria-pressed={preferences.density === density}
          >
            {DENSITY_LABEL[density]}
          </Button>
        ))}
      </fieldset>

      <fieldset className="flex items-center gap-2">
        <legend className="sr-only">Optional columns</legend>
        <span className="text-sm text-muted-foreground" aria-hidden="true">
          Columns
        </span>

        {OPTIONAL_COLUMNS.map((column) => {
          const visible = isColumnVisible(preferences, column);

          return (
            <Button
              key={column}
              type="submit"
              name="toggleColumn"
              value={column}
              size="sm"
              variant={visible ? "secondary" : "ghost"}
              aria-pressed={visible}
            >
              {COLUMN_LABEL[column]}
            </Button>
          );
        })}
      </fieldset>
    </form>
  );
}
