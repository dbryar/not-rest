import { z } from "zod/v4";
import type { OpContext, OperationResult } from "../call/dispatcher.ts";
import type { Database } from "bun:sqlite";
import { listItems } from "../services/catalog.ts";

/**
 * Browse the library catalog (deprecated, use v1:catalog.list instead).
 *
 * @op v1:catalog.listLegacy
 * @execution sync
 * @timeout 5s
 * @ttl 1h
 * @security items:browse
 * @cache server
 * @flags deprecated
 * @sunset 2026-06-01
 * @replacement v1:catalog.list
 */

export const args = z.object({
  type: z.enum(["book", "cd", "dvd", "boardgame"]).optional().describe("Filter by item type"),
  search: z.string().optional(),
  available: z.boolean().optional(),
  limit: z.int().min(1).max(100).optional().default(20),
  offset: z.int().min(0).optional().default(0),
});

export const result = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      title: z.string(),
      creator: z.string(),
      year: z.number().nullable(),
      available: z.boolean(),
      availableCopies: z.number(),
      totalCopies: z.number(),
    })
  ),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});

export async function handler(
  input: unknown,
  ctx: OpContext,
  db: Database
): Promise<OperationResult> {
  const parsed = input as z.infer<typeof args>;
  const data = listItems(db, {
    type: parsed.type,
    search: parsed.search,
    available: parsed.available,
    limit: parsed.limit,
    offset: parsed.offset,
  });

  return {
    state: "complete",
    result: {
      items: data.items.map((item) => ({
        id: item.id,
        type: item.type,
        title: item.title,
        creator: item.creator,
        year: item.year,
        available: item.available,
        availableCopies: item.availableCopies,
        totalCopies: item.totalCopies,
      })),
      total: data.total,
      limit: parsed.limit,
      offset: parsed.offset,
    },
  };
}
