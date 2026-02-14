import { z } from "zod/v4";
import type { OpContext, OperationResult } from "../call/dispatcher.ts";
import type { Database } from "bun:sqlite";
import { DomainError } from "../call/errors.ts";
import { hasOverdueItems } from "../services/lending.ts";

/**
 * Reserve a catalog item for pickup.
 *
 * @op v1:item.reserve
 * @execution sync
 * @timeout 5s
 * @ttl 0s
 * @cache none
 * @security items:write
 * @flags sideEffecting idempotencyRequired
 */

export const args = z.object({
  itemId: z.string(),
});

export const result = z.object({
  reservationId: z.string(),
  itemId: z.string(),
  title: z.string(),
  status: z.string(),
  reservedAt: z.string(),
  message: z.string(),
});

export async function handler(
  input: unknown,
  ctx: OpContext,
  db: Database
): Promise<OperationResult> {
  const parsed = input as z.infer<typeof args>;

  // 1. Check if patron has overdue items
  const overdue = hasOverdueItems(db, ctx.patronId);
  if (overdue.hasOverdue) {
    throw new DomainError("OVERDUE_ITEMS_EXIST", "You have overdue items that must be returned before reserving new items", {
      count: overdue.count,
      hint: "Use v1:patron.get to view your overdue items",
    });
  }

  // 2. Check if item exists
  const item = db
    .prepare("SELECT id, title, available_copies FROM catalog_items WHERE id = ?")
    .get(parsed.itemId) as { id: string; title: string; available_copies: number } | null;

  if (!item) {
    throw new DomainError("ITEM_NOT_FOUND", `Item ${parsed.itemId} not found`);
  }

  // 3. Check if item has available copies
  if (item.available_copies <= 0) {
    throw new DomainError("ITEM_NOT_AVAILABLE", `Item ${parsed.itemId} has no available copies`);
  }

  // 4. Check if patron already has active reservation
  const existing = db
    .prepare(
      "SELECT id FROM reservations WHERE item_id = ? AND patron_id = ? AND status IN ('pending', 'ready')"
    )
    .get(parsed.itemId, ctx.patronId) as Record<string, unknown> | null;

  if (existing) {
    throw new DomainError("ALREADY_RESERVED", `You already have an active reservation for item ${parsed.itemId}`);
  }

  // 5. Create reservation record
  const reservationId = crypto.randomUUID();
  const reservedAt = new Date().toISOString();

  db.prepare(
    "INSERT INTO reservations (id, item_id, patron_id, status, reserved_at) VALUES (?, ?, ?, 'pending', ?)"
  ).run(reservationId, parsed.itemId, ctx.patronId, reservedAt);

  // 6. Return result
  return {
    state: "complete",
    result: {
      reservationId,
      itemId: parsed.itemId,
      title: item.title,
      status: "pending",
      reservedAt,
      message: `Item "${item.title}" reserved successfully`,
    },
  };
}
