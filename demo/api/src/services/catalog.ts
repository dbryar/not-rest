import type { Database } from "bun:sqlite";

export interface CatalogItem {
  id: string;
  type: string;
  title: string;
  creator: string;
  year: number | null;
  isbn: string | null;
  description: string | null;
  coverImageKey: string | null;
  tags: string[];
  available: boolean;
  totalCopies: number;
  availableCopies: number;
}

interface ListFilters {
  type?: string;
  search?: string;
  available?: boolean;
  limit: number;
  offset: number;
}

export function listItems(
  db: Database,
  filters: ListFilters
): { items: CatalogItem[]; total: number } {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.type) {
    conditions.push("type = ?");
    params.push(filters.type);
  }
  if (filters.search) {
    conditions.push("(title LIKE ? OR creator LIKE ?)");
    params.push(`%${filters.search}%`, `%${filters.search}%`);
  }
  if (filters.available !== undefined) {
    conditions.push("available = ?");
    params.push(filters.available ? 1 : 0);
  }

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Count total matching rows
  const countStmt = db.prepare(
    `SELECT COUNT(*) as total FROM catalog_items ${where}`
  );
  const countRow = countStmt.get(...params) as { total: number };

  // Fetch the requested page
  const dataStmt = db.prepare(
    `SELECT * FROM catalog_items ${where} ORDER BY title ASC LIMIT ? OFFSET ?`
  );
  const rows = dataStmt.all(...params, filters.limit, filters.offset) as Array<
    Record<string, unknown>
  >;

  return {
    items: rows.map(mapRow),
    total: countRow.total,
  };
}

export function getItem(
  db: Database,
  itemId: string
): CatalogItem | null {
  const stmt = db.prepare("SELECT * FROM catalog_items WHERE id = ?");
  const row = stmt.get(itemId) as Record<string, unknown> | null;
  if (!row) return null;
  return mapRow(row);
}

function mapRow(row: Record<string, unknown>): CatalogItem {
  return {
    id: row.id as string,
    type: row.type as string,
    title: row.title as string,
    creator: row.creator as string,
    year: row.year as number | null,
    isbn: row.isbn as string | null,
    description: row.description as string | null,
    coverImageKey: row.cover_image_key as string | null,
    tags: JSON.parse((row.tags as string) || "[]"),
    available: (row.available as number) === 1,
    totalCopies: row.total_copies as number,
    availableCopies: row.available_copies as number,
  };
}
