"use server";

import { z } from "zod";

import { advanceApplication } from "@/features/applications";
import { ACTIVE_STAGES } from "@/lib/enums";

import type { MoveOutcome } from "../move";

/**
 * Bounded to the **active** stages, and the bound is the point rather than a
 * formality.
 *
 * A `'use server'` export is a public endpoint: the identifier is a hash of the
 * source location, and anyone holding it can call it with any argument at all.
 * This one can only ever move an application along the live pipeline - closing
 * one out is a different gesture on the board and will be a different endpoint.
 *
 * The board has its own rather than reaching for the detail screen's because a
 * client component may only cross into another slice through its barrel, and the
 * applications barrel carries `server-only` queries that would follow it into the
 * browser bundle. The write itself is not duplicated: this delegates.
 */
const inputSchema = z.object({
  applicationId: z.string().min(1).max(64),
  targetStage: z.enum(ACTIVE_STAGES),
  idempotencyKey: z.string().min(1).max(255),
});

export type MoveCardInput = z.input<typeof inputSchema>;

export async function moveCard(input: unknown): Promise<MoveOutcome> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { kind: "failed" };

  const result = await advanceApplication(parsed.data);

  // The timeline is dropped here rather than carried to a screen with nowhere to
  // put it. Everything else passes through, because the board says something
  // different for each of them.
  return result.kind === "moved" ? { kind: "moved" } : result;
}
