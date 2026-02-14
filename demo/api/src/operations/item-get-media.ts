import { z } from "zod/v4";
import type { OpContext, OperationResult } from "../call/dispatcher.ts";
import type { Database } from "bun:sqlite";
import { getItem } from "../services/catalog.ts";
import { DomainError } from "../call/errors.ts";
import { getSignedUrl } from "../services/media.ts";

/**
 * Get cover image URL for a catalog item (returns 303 redirect or placeholder).
 *
 * @op v1:item.getMedia
 * @execution sync
 * @timeout 5s
 * @ttl 1h
 * @security items:read
 * @cache location
 */

export const args = z.object({
  itemId: z.string().describe("Catalog item ID"),
});

export const result = z.object({
  placeholder: z.boolean().optional(),
  uri: z.string().optional(),
});

export async function handler(
  input: unknown,
  ctx: OpContext,
  db: Database
): Promise<OperationResult> {
  const { itemId } = input as z.infer<typeof args>;
  const item = getItem(db, itemId);

  if (!item) {
    throw new DomainError("ITEM_NOT_FOUND", `No catalog item found with ID '${itemId}'.`);
  }

  if (item.coverImageKey) {
    const uri = await getSignedUrl(item.coverImageKey);
    return {
      state: "complete",
      location: { uri },
    };
  }

  // No cover image — return placeholder
  return {
    state: "complete",
    result: {
      placeholder: true,
      uri: "/assets/placeholder-cover.png",
    },
  };
}
