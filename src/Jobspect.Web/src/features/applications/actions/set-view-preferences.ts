"use server";

import { cookies } from "next/headers";

import { readViewPreferences } from "../queries/read-view-preferences";
import {
  DENSITIES,
  OPTIONAL_COLUMNS,
  serialiseViewPreferences,
  VIEW_COOKIE,
  VIEW_COOKIE_ATTRIBUTES,
  type Density,
  type OptionalColumn,
  type ViewPreferences,
} from "../view-preferences";

function densityFrom(value: FormDataEntryValue | null): Density | null {
  return DENSITIES.find((density) => density === value) ?? null;
}

function columnFrom(value: FormDataEntryValue | null): OptionalColumn | null {
  return OPTIONAL_COLUMNS.find((column) => column === value) ?? null;
}

/**
 * One action behind both controls, because both are one cookie.
 *
 * A `'use server'` export is a public endpoint, so the two inputs are read from
 * a fixed set rather than trusted: anything else leaves the preference it names
 * alone instead of writing whatever arrived. There is nothing to authorize - the
 * cookie describes this browser's view of a screen it may not even be able to
 * see - which is why this one does not re-verify a session.
 */
export async function setViewPreferences(formData: FormData): Promise<void> {
  const current = await readViewPreferences();

  const density = densityFrom(formData.get("density"));
  const toggled = columnFrom(formData.get("toggleColumn"));

  const next: ViewPreferences = {
    density: density ?? current.density,
    hidden:
      toggled === null
        ? current.hidden
        : current.hidden.includes(toggled)
          ? current.hidden.filter((column) => column !== toggled)
          : [...current.hidden, toggled],
  };

  const store = await cookies();
  store.set(VIEW_COOKIE, serialiseViewPreferences(next), VIEW_COOKIE_ATTRIBUTES);
}
