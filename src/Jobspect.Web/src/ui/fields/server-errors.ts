import type { FieldValues, Path, UseFormSetError } from "react-hook-form";

/**
 * Puts the API's field-keyed messages back on the fields they name.
 *
 * `types` rather than `message`, because a field can be refused for several
 * reasons at once and only `types` carries more than the first of them - the
 * same reason the form is configured with `criteriaMode: "all"`.
 *
 * Returns the messages it could not place. A key naming a field this form does
 * not render is not the user's to fix and must not be dropped silently either,
 * so the caller shows it above the form.
 */
export function applyFieldErrors<TFieldValues extends FieldValues>(
  setError: UseFormSetError<TFieldValues>,
  fieldErrors: Record<string, string[]>,
  known: readonly string[],
): string[] {
  const unplaced: string[] = [];

  for (const [field, messages] of Object.entries(fieldErrors)) {
    if (messages.length === 0) continue;

    if (!known.includes(field)) {
      unplaced.push(...messages);
      continue;
    }

    setError(field as Path<TFieldValues>, {
      type: "server",
      message: messages[0],
      types: Object.fromEntries(messages.map((message, index) => [String(index), message])),
    });
  }

  return unplaced;
}
