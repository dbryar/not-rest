import { z } from "zod/v4";
import type { OpContext, OperationResult } from "../call/dispatcher.ts";
import type { Database } from "bun:sqlite";
import { getLendingHistory } from "../services/lending.ts";

/**
 * Get lending history with filters and pagination.
 *
 * @op v1:patron.history
 * @execution sync
 * @timeout 5s
 * @ttl 5m
 * @security patron:read
 * @cache server
 */

export const args = z.object({
  limit: z.int().min(1).max(100).optional().default(20),
  offset: z.int().min(0).optional().default(0),
  status: z.enum(["active", "returned", "overdue"]).optional(),
});

export const result = z.object({
  patronId: z.string(),
  records: z.array(
    z.object({
      lendingId: z.string(),
      itemId: z.string(),
      title: z.string(),
      creator: z.string(),
      checkoutDate: z.string(),
      dueDate: z.string(),
      returnDate: z.string().nullable(),
      daysLate: z.number(),
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

  const data = getLendingHistory(db, ctx.patronId, {
    limit: parsed.limit,
    offset: parsed.offset,
    status: parsed.status,
  });

  return {
    state: "complete",
    result: {
      patronId: ctx.patronId,
      records: data.records,
      total: data.total,
      limit: parsed.limit,
      offset: parsed.offset,
    },
  };
}
