"use server";

import { z } from "zod";

import { api } from "@/server/api/client";
import { idempotencyHeaders, withInFlightRetry } from "@/server/api/idempotency";
import { requireSession } from "@/server/dal";
import { callAuthenticated } from "@/server/session/call";

import { toActivityEntry, type ActivityEntry } from "../to-activity-entry";

/**
 * Every `'use server'` export is a public endpoint: the identifier is a hash of
 * the source location, and anyone holding it can call this with any argument at
 * all. So the input is parsed rather than trusted, and the call below re-verifies
 * the session on the other side of it.
 *
 * The note's bound is deliberately far above the API's own 2000 characters. This
 * is a guard against a forged call rather than a second statement of the rule -
 * the API refuses a long note with a message keyed to the field, and duplicating
 * the number here would answer the honest case with "something went wrong"
 * instead of with what to fix.
 */
const inputSchema = z.object({
  applicationId: z.string().min(1).max(64),
  note: z.string().max(10_000),
  idempotencyKey: z.string().min(1).max(255),
});

export type AddNoteInput = z.input<typeof inputSchema>;

export type AddNoteResult =
  | { kind: "added"; entry: ActivityEntry }
  /** The API refused it, keyed to the field. Empty and over-long both land here. */
  | { kind: "invalid"; fieldErrors: Record<string, string[]> }
  /** The same key is already being written. The note is not lost. */
  | { kind: "in-flight" }
  | { kind: "failed" };

/**
 * Appends a note to an application's timeline.
 *
 * Returns its failures rather than throwing them, for the reason
 * `fetch-applications-page.ts` records: Next replaces a thrown server error with
 * a generic message and a digest, so anything the caller has to tell apart has
 * to come back as a value.
 */
export async function addNote(input: unknown): Promise<AddNoteResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { kind: "failed" };

  const { applicationId, note, idempotencyKey } = parsed.data;
  const session = await requireSession();

  const result = await withInFlightRetry(idempotencyKey, (key) =>
    callAuthenticated(session.sid, (init) =>
      api.POST("/api/v1/applications/{applicationId}/activity", {
        ...init,
        params: { path: { applicationId } },
        body: { note },
        // Merged, never replaced. `callAuthenticated` re-issues this call with an
        // Authorization header of its own after a forced refresh, and overwriting
        // that would send the one retry that matters out unauthenticated.
        headers: { ...init.headers, ...idempotencyHeaders(key) },
      }),
    ),
  );

  if (result.ok) return { kind: "added", entry: toActivityEntry(result.data) };

  switch (result.failure.kind) {
    case "validation":
      return { kind: "invalid", fieldErrors: result.failure.fieldErrors };

    case "idempotency-in-flight":
      // Reached only after `withInFlightRetry` has already waited and asked
      // again, so the first attempt is slower than the server's own estimate.
      // Still not a failure to report as one - the note is being written.
      return { kind: "in-flight" };

    default:
      return { kind: "failed" };
  }
}
