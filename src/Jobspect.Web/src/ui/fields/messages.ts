/**
 * Every message react-hook-form is holding for one field.
 *
 * With `criteriaMode: "all"` a failed field carries `types` - one entry per
 * rule it broke - and `message`, which is only the first of them. Reading
 * `message` alone is how a password refused for four reasons gets corrected one
 * round trip at a time, so `types` wins wherever it is populated.
 *
 * The parameter is deliberately loose. A field bound to an object, which the
 * money pair is, has an error node react-hook-form types as a merge of a field
 * error and a map of its children's, and narrowing that precisely buys nothing
 * a shape check does not.
 */
export interface ErrorLike {
  message?: unknown;
  types?: Record<string, unknown>;
}

export function messagesFor(error: ErrorLike | undefined): string[] {
  if (error === undefined) return [];

  const all = Object.values(error.types ?? {}).flatMap(toMessages);
  if (all.length > 0) return all;

  return typeof error.message === "string" ? [error.message] : [];
}

function toMessages(value: unknown): string[] {
  if (typeof value === "string") return [value];
  // A rule can answer with several messages of its own, and `true` means
  // "broken, no wording" - which there is nothing to show for.
  if (Array.isArray(value)) return value.filter((member) => typeof member === "string");

  return [];
}
