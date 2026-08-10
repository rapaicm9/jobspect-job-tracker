import { z } from "zod";

/**
 * How the account proved who it was.
 *
 * One arm today, and the shape exists for the second: a passkey assertion
 * reaches the same token pair by a different route, so it becomes a case in the
 * switch rather than a change at every call site. Everything downstream takes
 * the tokens and does not ask where they came from.
 */
export type Credential = { kind: "password"; email: string; password: string };

/**
 * Presence only. Zod is here because a `'use server'` export is a public
 * endpoint that anyone holding the action id can call with any arguments - not
 * to second-guess the API, which owns the password policy and answers a bad one
 * with every unmet rule at once.
 */
const passwordCredential = z.object({
  email: z.string().trim().min(1, "An email address is required."),
  password: z.string().min(1, "A password is required."),
});

export type CredentialParse =
  { ok: true; credential: Credential } | { ok: false; fieldErrors: Record<string, string[]> };

export function parsePasswordCredential(formData: FormData): CredentialParse {
  // Reading unknown form entries as unknown: a multipart body can carry a File
  // under any key, and `String(file)` would sail through a string check.
  const result = passwordCredential.safeParse({
    email: valueOf(formData, "email"),
    password: valueOf(formData, "password"),
  });

  if (!result.success) {
    return { ok: false, fieldErrors: z.flattenError(result.error).fieldErrors };
  }

  return { ok: true, credential: { kind: "password", ...result.data } };
}

function valueOf(formData: FormData, name: string): unknown {
  const value = formData.get(name);
  return typeof value === "string" ? value : undefined;
}
