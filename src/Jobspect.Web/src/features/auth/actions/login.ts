"use server";

import { redirect } from "next/navigation";

import { createSession } from "@/server/session/lifecycle";

import { parsePasswordCredential } from "../credential";
import { currentDeviceLabel, exchangeCredential, SIGNED_IN } from "../exchange";
import { toFormState, type AuthFormState } from "../form-state";

export async function login(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = parsePasswordCredential(formData);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors, formError: null };

  const result = await exchangeCredential(parsed.credential, await currentDeviceLabel());
  if (!result.ok) return toFormState(result.failure);

  await createSession(result.data);

  // Last, and never inside a try: `redirect` works by throwing, so catching
  // around it would turn a successful sign-in into a reported failure.
  redirect(SIGNED_IN);
}
