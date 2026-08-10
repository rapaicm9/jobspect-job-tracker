"use server";

import { redirect } from "next/navigation";

import { api, callApi } from "@/server/api/client";
import { createSession } from "@/server/session/lifecycle";

import { parsePasswordCredential } from "../credential";
import { currentDeviceLabel, SIGNED_IN } from "../exchange";
import { toFormState, type AuthFormState } from "../form-state";

export async function register(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = parsePasswordCredential(formData);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors, formError: null };

  const deviceLabel = await currentDeviceLabel();

  const result = await callApi(() =>
    api.POST("/api/v1/identity/register", {
      body: {
        email: parsed.credential.email,
        password: parsed.credential.password,
        // The API defaults this to Etc/UTC. The settings screen that sets it
        // properly can also say what it changes - every reminder instant - which
        // a hidden field on a registration form could not.
        timeZoneId: null,
        deviceLabel,
      },
    }),
  );

  if (!result.ok) return toFormState(result.failure);

  // Registration answers with the same token pair a login does, so the account
  // is signed in from here without a second call.
  await createSession(result.data);
  redirect(SIGNED_IN);
}
