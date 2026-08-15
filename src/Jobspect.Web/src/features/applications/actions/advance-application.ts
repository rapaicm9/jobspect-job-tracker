"use server";

import { z } from "zod";

import { ACTIVE_STAGES } from "@/lib/enums";

import { requestTransition, type TransitionResult } from "../request-transition";

/**
 * Bounded to the **active** stages, and that bound is the reason this is its own
 * action rather than a parameter on one.
 *
 * A `'use server'` export is a public endpoint: the identifier is a hash of the
 * source location, and anyone holding it can call it with any argument. Splitting
 * the two intents means a caller holding this identifier can only ever move an
 * application into the live pipeline - closing it needs the other one.
 */
const inputSchema = z.object({
  applicationId: z.string().min(1).max(64),
  targetStage: z.enum(ACTIVE_STAGES),
  idempotencyKey: z.string().min(1).max(255),
});

export type AdvanceApplicationInput = z.input<typeof inputSchema>;

/**
 * Moves an application further along the pipeline, or back into it.
 *
 * One intent from the user's side - "put this at Interview" - whether the
 * application was behind that stage or closed. Which of the two it was is the
 * server's to classify, and it logs the move as an advance or a reopen
 * accordingly.
 */
export async function advanceApplication(input: unknown): Promise<TransitionResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { kind: "failed" };

  const { applicationId, targetStage, idempotencyKey } = parsed.data;

  return requestTransition(applicationId, targetStage, idempotencyKey);
}
