"use client";

// A Client Component because `useActionState` is a client hook: the field errors
// have to survive the round trip and re-render in place. The pages that mount it
// stay Server Components.

import { useActionState } from "react";

import { Alert, AlertDescription } from "@/ui/alert";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";

import { EMPTY_FORM_STATE, type AuthFormState } from "../form-state";

import { FieldErrors } from "./field-errors";

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

  const emailErrors = state.fieldErrors.email;
  const passwordErrors = state.fieldErrors.password;
  const hintId = passwordHint === undefined ? undefined : "password-hint";

  return (
    <form action={submit} className="space-y-5" noValidate>
      {state.formError !== null && (
        <Alert variant="destructive">
          <AlertDescription>{state.formError}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={emailErrors !== undefined}
          aria-describedby={emailErrors === undefined ? undefined : "email-errors"}
        />
        <FieldErrors id="email-errors" messages={emailErrors} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete={passwordAutoComplete}
          required
          aria-invalid={passwordErrors !== undefined}
          aria-describedby={
            [passwordErrors === undefined ? undefined : "password-errors", hintId]
              .filter(Boolean)
              .join(" ") || undefined
          }
        />
        {passwordHint !== undefined && (
          <p id={hintId} className="text-sm text-muted-foreground">
            {passwordHint}
          </p>
        )}
        <FieldErrors id="password-errors" messages={passwordErrors} />
      </div>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? pendingLabel : submitLabel}
      </Button>
    </form>
  );
}
