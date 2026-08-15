"use client";

// A Client Component because `useActionState` is a client hook: the field errors
// have to survive the round trip and re-render in place. The pages that mount it
// stay Server Components.
//
// It is not a react-hook-form form and does not need to be. Two fields the
// browser can post on its own, no client-side rules worth stating, and the
// server owns every message - so what it takes from the forms kit is the
// wiring, not the library.

import { useActionState } from "react";

import { Button } from "@/ui/button";
import { FieldShell } from "@/ui/fields/field-shell";
import { FormError } from "@/ui/fields/form-actions";
import { Input } from "@/ui/input";

import { EMPTY_FORM_STATE, type AuthFormState } from "../form-state";

export interface CredentialFormProps {
  action: (state: AuthFormState, formData: FormData) => Promise<AuthFormState>;
  submitLabel: string;
  pendingLabel: string;
  /** "current-password" when signing in, "new-password" when registering. */
  passwordAutoComplete: "current-password" | "new-password";
  passwordHint?: string;
}

export function CredentialForm({
  action,
  submitLabel,
  pendingLabel,
  passwordAutoComplete,
  passwordHint,
}: CredentialFormProps) {
  const [state, submit, pending] = useActionState(action, EMPTY_FORM_STATE);

  return (
    <form action={submit} className="space-y-5" noValidate>
      <FormError message={state.formError} />

      <FieldShell label="Email" messages={state.fieldErrors.email ?? []}>
        {(binding) => (
          <Input {...binding} name="email" type="email" autoComplete="email" required />
        )}
      </FieldShell>

      <FieldShell
        label="Password"
        description={passwordHint}
        messages={state.fieldErrors.password ?? []}
      >
        {(binding) => (
          <Input
            {...binding}
            name="password"
            type="password"
            autoComplete={passwordAutoComplete}
            required
          />
        )}
      </FieldShell>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? pendingLabel : submitLabel}
      </Button>
    </form>
  );
}
