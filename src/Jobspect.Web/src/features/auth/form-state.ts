import type { ApiFailure } from "@/server/api/errors";

/**
 * What `useActionState` carries back to the form.
 *
 * `fieldErrors` holds a **list** per field, never a joined string: the API
 * answers a weak password with every unmet rule at once - four of them - and
 * collapsing those into one sentence tells the user to fix one thing at a time.
 */
export interface AuthFormState {
  fieldErrors: Record<string, string[]>;
  /** Wrong as a whole, with no field to blame. Rendered above the form. */
  formError: string | null;
}

export const EMPTY_FORM_STATE: AuthFormState = { fieldErrors: {}, formError: null };

const GENERIC =
  "Something went wrong on our side. Nothing was changed - please try again in a moment.";

export function fieldError(field: string, message: string): AuthFormState {
  return { fieldErrors: { [field]: [message] }, formError: null };
}

export function formError(message: string): AuthFormState {
  return { fieldErrors: {}, formError: message };
}

/**
 * The UI's reading of a failure, which is policy rather than contract - the
 * catalogue in `errors.ts` says what a code means, this says what this form
 * does about it.
 */
export function toFormState(failure: ApiFailure): AuthFormState {
  switch (failure.kind) {
    case "validation":
      return { fieldErrors: failure.fieldErrors, formError: null };

    case "credentials":
      // Form-level, deliberately. The API refuses to say which half was wrong so
      // that nobody can discover which addresses have accounts, and attaching
      // the message to a field would give that away on this side instead.
      return formError("The email or password is incorrect.");

    case "conflict":
      return failure.code === "registration.email_taken"
        ? fieldError("email", "That email address already has an account.")
        : formError(failure.problem.detail ?? GENERIC);

    case "rate-limited":
      return formError(
        failure.retryAfterSeconds === null
          ? "Too many attempts. Please wait a moment and try again."
          : `Too many attempts. Please try again in ${String(failure.retryAfterSeconds)} seconds.`,
      );

    case "unavailable":
    case "network":
      return formError("We could not reach the server. Please try again in a moment.");

    default:
      // Everything else is either a server fault or a code this form has no
      // business interpreting. Neither is the user's to fix, and neither belongs
      // attached to a field - a 500 beside the password box invites them to
      // change a password that was fine.
      return formError(GENERIC);
  }
}
