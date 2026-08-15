"use server";

import { z } from "zod";

import { TERMINAL_STAGES } from "@/server/api/enums";

import { requestTransition, type TransitionResult } from "../request-transition";

/**
 * Bounded to the **terminal** outcomes - see `advance-application.ts` for why
 * the two intents are separate exports rather than one with a stage argument.
 */
const inputSchema = z.object({
  applicationId: z.string().min(1).max(64),
  outcome: z.enum(TERMINAL_STAGES),
  idempotencyKey: z.string().min(1).max(255),
});

export type CloseApplicationInput = z.input<typeof inputSchema>;

/**
 * Closes an application on an outcome, or corrects the outcome it closed on.
 *
 * Accepted is bounded by the pipeline rather than by this schema: it is
 * reachable from Offer alone, so naming it from anywhere else is a legal-looking
 * request the server refuses. That refusal is the point - the client's model of
 * the state machine is a convenience and the server's is the truth.
 */
export async function closeApplication(input: unknown): Promise<TransitionResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { kind: "failed" };

  const { applicationId, outcome, idempotencyKey } = parsed.data;

  return requestTransition(applicationId, outcome, idempotencyKey);
}
