import type { Database } from "bun:sqlite";
import { DomainError } from "../call/errors.ts";

// ── Return Item ──────────────────────────────────────────────────────────

export function returnItem(
  db: Database,
  patronId: string,
  itemId: string
): {
  itemId: string;
  title: string;
  returnedAt: string;
  wasOverdue: boolean;
  daysLate: number;
  message: string;
} {
  // 1. Look up active lending record
  const lending = db
    .prepare(
      "SELECT * FROM lending_history WHERE patron_id = ? AND item_id = ? AND return_date IS NULL"
    )
    .get(patronId, itemId) as Record<string, unknown> | null;

  if (!lending) {
    // 3. Check if item exists at all
    const item = db
      .prepare("SELECT id FROM catalog_items WHERE id = ?")
      .get(itemId) as Record<string, unknown> | null;

    if (!item) {
      throw new DomainError("ITEM_NOT_FOUND", `Item ${itemId} not found`);
    }

    throw new DomainError(
      "ITEM_NOT_CHECKED_OUT",
      `Item ${itemId} is not checked out by this patron`
    );
  }

  // Get item title for the response
  const catalogItem = db
    .prepare("SELECT title FROM catalog_items WHERE id = ?")
    .get(itemId) as { title: string } | null;

  const title = catalogItem?.title ?? "Unknown";
  const now = new Date();
  const returnedAt = now.toISOString();
  const dueDate = new Date(lending.due_date as string);

  // 4. Calculate wasOverdue: due_date < now
  const wasOverdue = dueDate < now;

  // 5. Calculate daysLate: days between due_date and now (0 if not overdue)
  let daysLate = 0;
  if (wasOverdue) {
    const diffMs = now.getTime() - dueDate.getTime();
    daysLate = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  // 6. Update lending_history
  db.prepare(
    "UPDATE lending_history SET return_date = ?, days_late = ? WHERE id = ?"
  ).run(returnedAt, daysLate, lending.id as string);

  // 7. Update catalog_items availability
  db.prepare(
    "UPDATE catalog_items SET available_copies = available_copies + 1, available = 1 WHERE id = ?"
  ).run(itemId);

  // 8. Return result
  const message = wasOverdue
    ? `Item returned ${daysLate} day${daysLate !== 1 ? "s" : ""} late`
    : "Item returned on time";

  return { itemId, title, returnedAt, wasOverdue, daysLate, message };
}

// ── Overdue Items ────────────────────────────────────────────────────────

export function getOverdueItems(
  db: Database,
  patronId: string
): Array<{
  lendingId: string;
  itemId: string;
  title: string;
  creator: string;
  type: string;
  checkoutDate: string;
  dueDate: string;
  daysOverdue: number;
}> {
  const rows = db
    .prepare(
      `SELECT lh.id, lh.item_id, lh.checkout_date, lh.due_date, ci.title, ci.creator, ci.type
       FROM lending_history lh
       JOIN catalog_items ci ON ci.id = lh.item_id
       WHERE lh.patron_id = ? AND lh.return_date IS NULL AND lh.due_date < date('now')`
    )
    .all(patronId) as Array<Record<string, unknown>>;

  const now = new Date();

  return rows.map((row) => {
    const dueDate = new Date(row.due_date as string);
    const diffMs = now.getTime() - dueDate.getTime();
    const daysOverdue = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

    return {
      lendingId: row.id as string,
      itemId: row.item_id as string,
      title: row.title as string,
      creator: row.creator as string,
      type: row.type as string,
      checkoutDate: row.checkout_date as string,
      dueDate: row.due_date as string,
      daysOverdue,
    };
  });
}

// ── Has Overdue Items ────────────────────────────────────────────────────

export function hasOverdueItems(
  db: Database,
  patronId: string
): { hasOverdue: boolean; count: number } {
  const row = db
    .prepare(
      `SELECT COUNT(*) as count FROM lending_history
       WHERE patron_id = ? AND return_date IS NULL AND due_date < date('now')`
    )
    .get(patronId) as { count: number };

  return {
    hasOverdue: row.count > 0,
    count: row.count,
  };
}

// ── Get Active Checkout ──────────────────────────────────────────────────

export function getActiveCheckout(
  db: Database,
  patronId: string,
  itemId: string
): Record<string, unknown> | null {
  const row = db
    .prepare(
      "SELECT * FROM lending_history WHERE patron_id = ? AND item_id = ? AND return_date IS NULL"
    )
    .get(patronId, itemId) as Record<string, unknown> | null;

  return row;
}

// ── Lending History ──────────────────────────────────────────────────────

export function getLendingHistory(
  db: Database,
  patronId: string,
  opts: {
    limit?: number;
    offset?: number;
    status?: "active" | "returned" | "overdue";
  }
): { records: Array<Record<string, unknown>>; total: number } {
  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;

  const conditions: string[] = ["lh.patron_id = ?"];
  const params: unknown[] = [patronId];

  if (opts.status === "active") {
    conditions.push("lh.return_date IS NULL AND lh.due_date >= date('now')");
  } else if (opts.status === "returned") {
    conditions.push("lh.return_date IS NOT NULL");
  } else if (opts.status === "overdue") {
    conditions.push("lh.return_date IS NULL AND lh.due_date < date('now')");
  }

  const where = `WHERE ${conditions.join(" AND ")}`;

  const countRow = db
    .prepare(`SELECT COUNT(*) as total FROM lending_history lh ${where}`)
    .get(...params) as { total: number };

  const rows = db
    .prepare(
      `SELECT lh.*, ci.title, ci.creator
       FROM lending_history lh
       JOIN catalog_items ci ON ci.id = lh.item_id
       ${where}
       ORDER BY lh.checkout_date DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as Array<Record<string, unknown>>;

  return {
    records: rows.map((row) => ({
      lendingId: row.id as string,
      itemId: row.item_id as string,
      title: row.title as string,
      creator: row.creator as string,
      checkoutDate: row.checkout_date as string,
      dueDate: row.due_date as string,
      returnDate: (row.return_date as string | null) ?? null,
      daysLate: row.days_late as number,
    })),
    total: countRow.total,
  };
}
