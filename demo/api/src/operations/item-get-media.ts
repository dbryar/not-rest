import { z } from "zod/v4";
import type { OpContext, OperationResult } from "../call/dispatcher.ts";
import type { Database } from "bun:sqlite";
import { getItem } from "../services/catalog.ts";
import { DomainError } from "../call/errors.ts";

/**
 * Get cover image URL for a catalog item (returns 303 redirect or placeholder).
 *
 * @op v1:item.getMedia
 * @execution sync
 * @timeout 5000
 * @ttl 3600
 * @security items:read
 * @cache location
 */

export const args = z.object({
  itemId: z.string(),
});

export const result = z.object({
  placeholder: z.boolean().optional(),
  url: z.string().optional(),
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

  if (item.coverImageKey) {
    // In production, this would be a signed GCS URL. For demo, we use a mock URL.
    const bucket = process.env.GCS_BUCKET || "opencall-demo";
    const url = `https://storage.googleapis.com/${bucket}/${item.coverImageKey}`;
    return {
      state: "complete",
      location: { uri: url },
    };
  }

  // No cover image -- return placeholder
  return {
    state: "complete",
    result: {
      placeholder: true,
      url: "https://via.placeholder.com/300x400?text=No+Cover",
    },
  };
}
