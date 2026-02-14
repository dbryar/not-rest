import { z } from "zod/v4";
import type { OpContext, OperationResult } from "../call/dispatcher.ts";
import type { Database } from "bun:sqlite";
import { DomainError } from "../call/errors.ts";
import { returnItem } from "../services/lending.ts";

/**
 * Return a checked-out item to the library.
 *
 * @op v1:item.return
 * @execution sync
 * @timeout 5s
 * @ttl 0s
 * @security items:checkin
 * @cache none
 * @flags sideEffecting idempotencyRequired
 */

export const args = z.object({
  itemId: z.string(),
});

export const result = z.object({
  itemId: z.string(),
  title: z.string(),
  returnedAt: z.string(),
  wasOverdue: z.boolean(),
  daysLate: z.number(),
  message: z.string(),
});

export async function handler(
  input: unknown,
  ctx: OpContext,
  db: Database
): Promise<OperationResult> {
  const parsed = input as z.infer<typeof args>;

  // Check that item exists in catalog_items
  const item = db
    .prepare("SELECT id FROM catalog_items WHERE id = ?")
    .get(parsed.itemId) as Record<string, unknown> | null;

  if (!item) {
    throw new DomainError("ITEM_NOT_FOUND", `Item ${parsed.itemId} not found`);
  }

  const data = returnItem(db, ctx.patronId, parsed.itemId);

  return {
    state: "complete",
    result: data,
  };
}
