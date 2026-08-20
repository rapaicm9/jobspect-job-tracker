"use server";

import { z } from "zod";

import { closeApplication } from "@/features/applications";
import { TERMINAL_STAGES } from "@/lib/enums";

import type { MoveOutcome } from "../move";

/**
 * Bounded to the **terminal** outcomes, which is why it is a second export rather
 * than a stage argument on `moveCard`.
 *
 * A `'use server'` export is a public endpoint: the identifier is a hash of the
 * source location, and anyone holding it can call it with any argument at all.
 * Splitting the two means the identifier behind the drag can only ever advance an
 * application and this one can only ever close it.
 *
 * Accepted is bounded by the pipeline rather than by this schema - it is reachable
 * from Offer alone, so naming it from anywhere else is a legal-looking request the
 * server refuses, and the refusal is the point.
 */
const inputSchema = z.object({
  applicationId: z.string().min(1).max(64),
  outcome: z.enum(TERMINAL_STAGES),
  idempotencyKey: z.string().min(1).max(255),
});

export type CloseCardInput = z.input<typeof inputSchema>;

export async function closeCard(input: unknown): Promise<MoveOutcome> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { kind: "failed" };

  const result = await closeApplication(parsed.data);

  // The timeline is dropped here rather than carried to a screen with nowhere to
  // put it, the same way the advance does. Everything else passes through.
  return result.kind === "moved" ? { kind: "moved" } : result;
}
