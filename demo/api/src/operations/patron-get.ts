import { z } from "zod/v4";
import type { OpContext, OperationResult } from "../call/dispatcher.ts";
import type { Database } from "bun:sqlite";
import { DomainError } from "../call/errors.ts";
import { getOverdueItems } from "../services/lending.ts";

/**
 * Get patron profile, overdue items, and account summary.
 *
 * @op v1:patron.get
 * @execution sync
 * @timeout 5s
 * @ttl 0s
 * @security patron:read
 * @cache none
 */

export const args = z.object({});

export const result = z.object({
  patronId: z.string(),
  patronName: z.string(),
  cardNumber: z.string(),
  overdueItems: z.array(
    z.object({
      lendingId: z.string(),
      itemId: z.string(),
      title: z.string(),
      creator: z.string(),
      checkoutDate: z.string(),
      dueDate: z.string(),
      type: z.string(),
      daysOverdue: z.number(),
    })
  ),
  totalOverdue: z.number(),
  activeReservations: z.number(),
  totalCheckedOut: z.number(),
});

export async function handler(
  _input: unknown,
  ctx: OpContext,
  db: Database
): Promise<OperationResult> {
  // Look up patron from ctx.patronId
  const patron = db
    .prepare("SELECT id, name, card_number FROM patrons WHERE id = ?")
    .get(ctx.patronId) as { id: string; name: string; card_number: string } | null;

  if (!patron) {
    throw new DomainError("PATRON_NOT_FOUND", `Patron ${ctx.patronId} not found`);
  }

  // Get overdue items
  const overdueItems = getOverdueItems(db, ctx.patronId);

  // Count active reservations
  const reservationRow = db
    .prepare(
      "SELECT COUNT(*) as count FROM reservations WHERE patron_id = ? AND status IN ('pending', 'ready')"
    )
    .get(ctx.patronId) as { count: number };

  // Count total checked out (active loans)
  const checkedOutRow = db
    .prepare(
      "SELECT COUNT(*) as count FROM lending_history WHERE patron_id = ? AND return_date IS NULL"
    )
    .get(ctx.patronId) as { count: number };

  return {
    state: "complete",
    result: {
      patronId: patron.id,
      patronName: patron.name,
      cardNumber: patron.card_number,
      overdueItems,
      totalOverdue: overdueItems.length,
      activeReservations: reservationRow.count,
      totalCheckedOut: checkedOutRow.count,
    },
  };
}
