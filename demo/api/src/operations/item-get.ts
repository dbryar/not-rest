import { z } from "zod/v4";
import type { OpContext, OperationResult } from "../call/dispatcher.ts";
import type { Database } from "bun:sqlite";
import { getItem } from "../services/catalog.ts";
import { DomainError } from "../call/errors.ts";

/**
 * Get full details for a catalog item by ID.
 *
 * @op v1:item.get
 * @execution sync
 * @timeout 5s
 * @ttl 1h
 * @security items:read
 * @cache server
 */

export const args = z.object({
  itemId: z.string(),
});

export const result = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  creator: z.string(),
  year: z.number().nullable(),
  isbn: z.string().nullable(),
  description: z.string().nullable(),
  coverImageKey: z.string().nullable(),
  tags: z.array(z.string()),
  available: z.boolean(),
  totalCopies: z.number(),
  availableCopies: z.number(),
});

export async function handler(
  input: unknown,
  ctx: OpContext,
  db: Database
): Promise<OperationResult> {
  const { itemId } = input as z.infer<typeof args>;
  const item = getItem(db, itemId);

  if (!item) {
    throw new DomainError("ITEM_NOT_FOUND", `Item not found: ${itemId}`);
  }

  return {
    state: "complete",
    result: item,
  };
}
