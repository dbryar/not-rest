import { z } from "zod/v4";
import type { OpContext, OperationResult } from "../call/dispatcher.ts";
import type { Database } from "bun:sqlite";

/**
 * Bulk import items into the catalog (always returns 403 - scope never granted).
 *
 * @op v1:catalog.bulkImport
 * @execution async
 * @timeout 30s
 * @ttl 1h
 * @cache none
 * @security items:manage
 * @flags sideEffecting idempotencyRequired
 */

export const args = z.object({
  items: z.array(
    z.object({
      type: z.string(),
      title: z.string(),
      creator: z.string(),
      year: z.number().optional(),
    })
  ),
});

export const result = z.object({
  imported: z.number(),
  errors: z.array(z.unknown()),
});

export async function handler(
  _input: unknown,
  _ctx: OpContext,
  _db: Database
): Promise<OperationResult> {
  // This handler is never reached because items:manage is in NEVER_GRANTED.
  // The dispatcher will return 403 INSUFFICIENT_SCOPES before reaching here.
  return {
    state: "complete",
    result: {
      imported: 0,
      errors: [],
    },
  };
}
