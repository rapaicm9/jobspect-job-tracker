"use server";

import { z } from "zod";

import { requestDeletion, type DeleteApplicationResult } from "../delete-application";

/**
 * A forgery guard rather than a second statement of the API's rules. A
 * `'use server'` export is a public endpoint - the identifier is a hash of the
 * source location, and anyone holding it can call this with any argument at all
 * - so the id is parsed before it is forwarded. Ownership is the server's
 * question, and it answers a stranger's id with a 404.
 */
const inputSchema = z.object({
  applicationId: z.string().min(1).max(64),
});

export type DeleteApplicationInput = z.input<typeof inputSchema>;

/**
 * Removes an application and everything hanging off it, and answers where the
 * caller stands.
 *
 * The list's intent. It stays on the page it is on, so this returns rather than
 * navigating - see `delete-application-and-return.ts` for the other one.
 */
export async function deleteApplication(input: unknown): Promise<DeleteApplicationResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { kind: "failed" };

  return requestDeletion(parsed.data.applicationId);
}
