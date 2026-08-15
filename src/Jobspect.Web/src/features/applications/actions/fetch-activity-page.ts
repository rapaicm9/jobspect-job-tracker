"use server";

import { z } from "zod";

import { listActivity, type ActivityRead } from "../queries/list-activity";

/**
 * Parsed rather than trusted, for the reason `fetch-applications-page.ts`
 * records: a `'use server'` export is a public endpoint. A cursor is opaque to
 * this client - the API mints and reads it - so the only thing worth asserting
 * is that it is a string of a sane length.
 */
const inputSchema = z.object({
  applicationId: z.string().min(1).max(64),
  cursor: z.string().min(1).max(512).nullable(),
});

export type FetchActivityPageInput = z.input<typeof inputSchema>;

/** The paging read, called from `useInfiniteQuery` rather than rendered. */
export async function fetchActivityPage(input: unknown): Promise<ActivityRead> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { kind: "failed" };

  return listActivity(parsed.data.applicationId, parsed.data.cursor);
}
