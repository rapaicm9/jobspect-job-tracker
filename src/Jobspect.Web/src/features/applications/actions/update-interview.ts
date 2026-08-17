"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { api } from "@/server/api/client";
import { requireSession } from "@/server/dal";
import { callAuthenticated } from "@/server/session/call";

/** A forgery guard rather than a second statement of the API's rules. */
const text = z.string().max(10_000).nullable();

const inputSchema = z.object({
  applicationId: z.string().min(1).max(64),
  interviewId: z.string().min(1).max(64),
  body: z.object({
    scheduledAt: text,
    type: text,
    format: text,
    outcome: text,
    notes: text,
  }),
});

export type UpdateInterviewInput = z.input<typeof inputSchema>;

export type UpdateInterviewResult =
  | { kind: "saved" }
  /** Field-keyed messages, several per field. */
  | { kind: "invalid"; fieldErrors: Record<string, string[]> }
  /** A refusal the API keyed to one field itself, carrying its own sentence. */
  | { kind: "refused"; field: string; detail: string }
  /** The round, or the application under it, is gone. */
  | { kind: "gone" }
  | { kind: "unavailable" }
  | { kind: "failed" };

/**
 * Replaces every editable field of one round, including recording how it ended.
 *
 * No `Idempotency-Key`, and that is not an omission: a full replace applied twice
 * leaves exactly what applying it once does, so the endpoint takes no such
 * header. Scheduling is where the key comes back.
 *
 * There is no DELETE on this resource. Calling a round off is an outcome of
 * `Cancelled`, which is also what retracts the reminders standing against it.
 *
 * Failures return rather than throw, for the reason the other actions record.
 */
export async function updateInterview(input: unknown): Promise<UpdateInterviewResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { kind: "failed" };

  const { applicationId, interviewId, body } = parsed.data;
  const session = await requireSession();

  const result = await callAuthenticated(session.sid, (init) =>
    api.PUT("/api/v1/applications/{applicationId}/interviews/{interviewId}", {
      ...init,
      params: { path: { applicationId, interviewId } },
      body,
    }),
  );

  if (result.ok) {
    // Folded into this response rather than refreshed from the component, for the
    // reason `update-application.ts` records at length.
    revalidatePath(`/applications/${applicationId}`);

    return { kind: "saved" };
  }

  switch (result.failure.kind) {
    case "validation":
      return { kind: "invalid", fieldErrors: result.failure.fieldErrors };

    case "field-error":
      return {
        kind: "refused",
        field: result.failure.field,
        detail: result.failure.problem.detail ?? "That value was refused.",
      };

    case "not-found":
      return { kind: "gone" };

    case "unavailable":
      return { kind: "unavailable" };

    default:
      return { kind: "failed" };
  }
}
