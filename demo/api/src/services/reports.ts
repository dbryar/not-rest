import { getDb } from "../db/connection.ts";
import { transitionOperation } from "./lifecycle.ts";
import { uploadReport, isGcsConfigured } from "./media.ts";

/** In-memory store for generated report data, keyed by requestId */
export const reportStore = new Map<string, string>();

/**
 * Generate a report asynchronously. This function:
 * 1. Transitions the operation to 'pending'
 * 2. Waits 3-5 seconds (simulated processing)
 * 3. Queries lending data from the database
 * 4. Formats as CSV or JSON
 * 5. Uploads to GCS (if configured) or stores in memory
 * 6. Transitions to 'complete'
 */
export async function generateReport(
  requestId: string,
  args: {
    format: "csv" | "json";
    itemType?: string;
    dateFrom?: string;
    dateTo?: string;
  },
  patronId: string
): Promise<void> {
  try {
    // 1. Transition to pending
    transitionOperation(requestId, { type: "START" });

    // 2. Simulated processing delay (3-5 seconds)
    const delayMs = 3000 + Math.random() * 2000;
    await new Promise((resolve) => setTimeout(resolve, delayMs));

    // 3. Query lending data
    const db = getDb();
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (args.itemType) {
      conditions.push("ci.type = ?");
      params.push(args.itemType);
    }
    if (args.dateFrom) {
      conditions.push("lh.checkout_date >= ?");
      params.push(args.dateFrom);
    }
    if (args.dateTo) {
      conditions.push("lh.checkout_date <= ?");
      params.push(args.dateTo);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = db
      .prepare(
        `SELECT lh.id, lh.item_id, lh.patron_id, lh.patron_name, lh.checkout_date,
                lh.due_date, lh.return_date, lh.days_late, ci.title, ci.type, ci.creator
         FROM lending_history lh
         JOIN catalog_items ci ON ci.id = lh.item_id
         ${where}
         ORDER BY lh.checkout_date DESC`
      )
      .all(...(params as [string, ...string[]])) as Array<Record<string, unknown>>;

    // 4. Format the report
    let reportContent: string;
    const mimeType = args.format === "csv" ? "text/csv" : "application/json";

    if (args.format === "csv") {
      const header = "id,item_id,title,type,creator,patron_id,patron_name,checkout_date,due_date,return_date,days_late";
      const csvRows = rows.map((row) =>
        [
          row.id,
          row.item_id,
          `"${(row.title as string).replace(/"/g, '""')}"`,
          row.type,
          `"${(row.creator as string).replace(/"/g, '""')}"`,
          row.patron_id,
          `"${(row.patron_name as string).replace(/"/g, '""')}"`,
          row.checkout_date,
          row.due_date,
          row.return_date ?? "",
          row.days_late ?? 0,
        ].join(",")
      );
      reportContent = [header, ...csvRows].join("\n");
    } else {
      reportContent = JSON.stringify(
        rows.map((row) => ({
          id: row.id,
          itemId: row.item_id,
          title: row.title,
          type: row.type,
          creator: row.creator,
          patronId: row.patron_id,
          patronName: row.patron_name,
          checkoutDate: row.checkout_date,
          dueDate: row.due_date,
          returnDate: row.return_date ?? null,
          daysLate: row.days_late ?? 0,
        })),
        null,
        2
      );
    }

    // 5. Upload to GCS if configured
    if (isGcsConfigured()) {
      await uploadReport(requestId, reportContent, mimeType);
    }

    // 6. Store in memory for chunk retrieval
    reportStore.set(requestId, reportContent);

    // 7. Also store in DB for persistence across module reloads
    db.prepare(
      "UPDATE operations SET result_data = ? WHERE request_id = ?"
    ).run(reportContent, requestId);

    // 8. Transition to complete with a download location
    const resultLocation = `/ops/${requestId}/chunks`;
    transitionOperation(requestId, { type: "COMPLETE", resultLocation });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    try {
      transitionOperation(requestId, { type: "FAIL", message });
    } catch {
      // If transition itself fails (e.g. already in error state), ignore
    }
  }
}
