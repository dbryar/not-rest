import type { Database } from "bun:sqlite";

export function resetDatabase(db: Database): void {
  db.exec("BEGIN TRANSACTION");
  try {
    // Delete transient data
    db.exec("DELETE FROM auth_tokens");
    db.exec("DELETE FROM operations");
    db.exec("DELETE FROM reservations");
    db.exec("DELETE FROM patrons WHERE is_seed = 0");
    db.exec("DELETE FROM lending_history WHERE is_seed = 0");

    // Restore seed lending records to original state
    // (reset return_date to NULL for seed overdue items that were returned during the session)
    db.exec(`
      UPDATE lending_history
      SET return_date = NULL, days_late = 0
      WHERE is_seed = 1 AND due_date < date('now')
    `);

    // Recalculate available_copies for all catalog items based on remaining lending records
    db.exec(`
      UPDATE catalog_items SET
        available_copies = total_copies - COALESCE(
          (SELECT COUNT(*) FROM lending_history
           WHERE item_id = catalog_items.id AND return_date IS NULL), 0
        ),
        available = CASE
          WHEN total_copies - COALESCE(
            (SELECT COUNT(*) FROM lending_history
             WHERE item_id = catalog_items.id AND return_date IS NULL), 0
          ) > 0 THEN 1 ELSE 0
        END
    `);

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

// CLI entry point
if (import.meta.main) {
  const { getDb, closeDb } = await import("./connection.ts");
  const db = getDb();
  resetDatabase(db);
  closeDb();
  console.log("Database reset complete");
}
