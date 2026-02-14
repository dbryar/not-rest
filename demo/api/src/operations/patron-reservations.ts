import { z } from "zod/v4";
import type { OpContext, OperationResult } from "../call/dispatcher.ts";
import type { Database } from "bun:sqlite";

/**
 * List patron's reservations with optional status filter and pagination.
 *
 * @op v1:patron.reservations
 * @execution sync
 * @timeout 5s
 * @ttl 0s
 * @security patron:read
 * @cache none
 */

export const args = z.object({
  limit: z.int().min(1).max(100).optional().default(20),
  offset: z.int().min(0).optional().default(0),
  status: z.enum(["pending", "ready", "collected", "cancelled"]).optional(),
});

export const result = z.object({
  patronId: z.string(),
  reservations: z.array(
    z.object({
      reservationId: z.string(),
      itemId: z.string(),
      title: z.string(),
      creator: z.string(),
      status: z.string(),
      reservedAt: z.string(),
      readyAt: z.string().nullable(),
      collectedAt: z.string().nullable(),
      cancelledAt: z.string().nullable(),
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

  let where = "r.patron_id = ?";
  const params: (string | number)[] = [ctx.patronId];

  if (parsed.status) {
    where += " AND r.status = ?";
    params.push(parsed.status);
  }

  // Count total matching
  const countRow = db
    .prepare(`SELECT COUNT(*) as count FROM reservations r WHERE ${where}`)
    .get(...params) as { count: number };

  // Fetch page
  params.push(parsed.limit, parsed.offset);
  const rows = db
    .prepare(
      `SELECT r.id, r.item_id, r.status, r.reserved_at, r.ready_at, r.collected_at, r.cancelled_at,
              ci.title, ci.creator
       FROM reservations r
       JOIN catalog_items ci ON ci.id = r.item_id
       WHERE ${where}
       ORDER BY r.reserved_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params) as Array<{
      id: string;
      item_id: string;
      status: string;
      reserved_at: string;
      ready_at: string | null;
      collected_at: string | null;
      cancelled_at: string | null;
      title: string;
      creator: string;
    }>;

  return {
    state: "complete",
    result: {
      patronId: ctx.patronId,
      reservations: rows.map((r) => ({
        reservationId: r.id,
        itemId: r.item_id,
        title: r.title,
        creator: r.creator,
        status: r.status,
        reservedAt: r.reserved_at,
        readyAt: r.ready_at,
        collectedAt: r.collected_at,
        cancelledAt: r.cancelled_at,
      })),
      total: countRow.count,
      limit: parsed.limit,
      offset: parsed.offset,
    },
  };
}
