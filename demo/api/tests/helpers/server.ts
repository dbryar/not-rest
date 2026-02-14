// IMPORTANT: Set DATABASE_PATH before any module imports connection.ts,
// because connection.ts reads process.env.DATABASE_PATH at module scope.
process.env.DATABASE_PATH = `:memory:`;

import type { Database } from "bun:sqlite";

let server: ReturnType<typeof Bun.serve> | null = null;

export async function startServer(): Promise<void> {
  process.env.PORT = process.env.TEST_PORT || "9876";
  const { startServer: start } = await import("../../src/server.ts");
  server = await start();

  // Seed the in-memory database with test data
  const { getDb } = await import("../../src/db/connection.ts");
  seedTestDb(getDb());
}

export async function stopServer(): Promise<void> {
  if (server) {
    server.stop(true);
    server = null;
  }
  const { closeDb } = await import("../../src/db/connection.ts");
  closeDb();
}

// ── Minimal seed for tests ──────────────────────────────────────────────
// Inserts a small set of catalog items, patrons, and lending records
// so that tests have data to work with.

function seedTestDb(db: Database): void {
  // Check if already seeded
  const existing = (
    db.prepare("SELECT COUNT(*) as c FROM catalog_items").get() as { c: number }
  ).c;
  if (existing > 0) return;

  // ── Catalog items ──────────────────────────────────────────────────
  // High copy counts ensure new patrons can always be seeded with overdue items,
  // even when multiple test files run in parallel and create many patrons.
  const items = [
    // Fixed test book for integration tests (same ID as in seed.ts)
    { id: "00000000-0000-0000-0000-000000000100", type: "book", title: "The Test Pattern Handbook", creator: "Demo Author", year: 2024, isbn: "9780000000001", totalCopies: 5 },
    { id: "item-book-001", type: "book", title: "The Crystal Garden", creator: "Alice Smith", year: 2020, isbn: "9781234567890", totalCopies: 20 },
    { id: "item-book-002", type: "book", title: "Journey to Midnight", creator: "Bob Johnson", year: 2019, isbn: "9781234567891", totalCopies: 20 },
    { id: "item-book-003", type: "book", title: "Secrets of the Tower", creator: "Charlie Davis", year: 2021, isbn: "9781234567892", totalCopies: 20 },
    { id: "item-book-004", type: "book", title: "Beyond the Horizon", creator: "Diana Garcia", year: 2018, isbn: "9781234567893", totalCopies: 20 },
    { id: "item-book-005", type: "book", title: "Lost in the Valley", creator: "Edward Martinez", year: 2022, isbn: "9781234567894", totalCopies: 20 },
    { id: "item-book-006", type: "book", title: "Return of the Amber Shore", creator: "Fiona Williams", year: 2017, isbn: "9781234567895", totalCopies: 20 },
    { id: "item-book-007", type: "book", title: "Echoes from the Sapphire Gate", creator: "George Brown", year: 2023, isbn: "9781234567896", totalCopies: 20 },
    { id: "item-book-008", type: "book", title: "Shadow of the Iron Forest", creator: "Hannah Jones", year: 2016, isbn: "9781234567897", totalCopies: 20 },
    { id: "item-book-009", type: "book", title: "Rise of the Golden Bridge", creator: "Ivan Taylor", year: 2024, isbn: "9781234567898", totalCopies: 20 },
    { id: "item-book-010", type: "book", title: "Whispers of the Silver Moon", creator: "Julia Anderson", year: 2015, isbn: "9781234567899", totalCopies: 20 },
    { id: "item-cd-001", type: "cd", title: "Midnight Sessions", creator: "The Blue Notes", year: 2021, isbn: null, totalCopies: 10 },
    { id: "item-cd-002", type: "cd", title: "Frequencies Vol. 2", creator: "Lunar Frequencies", year: 2020, isbn: null, totalCopies: 10 },
    { id: "item-cd-003", type: "cd", title: "Resonance", creator: "Aria Blackwood", year: 2022, isbn: null, totalCopies: 10 },
    { id: "item-dvd-001", type: "dvd", title: "City of Echoes", creator: "Sarah Chen", year: 2022, isbn: null, totalCopies: 10 },
    { id: "item-dvd-002", type: "dvd", title: "The Last Frontier", creator: "Marcus Webb", year: 2019, isbn: null, totalCopies: 10 },
    { id: "item-bg-001", type: "boardgame", title: "Settlers of the Isle", creator: "Stonemaier Games", year: 2023, isbn: null, totalCopies: 10 },
    { id: "item-bg-002", type: "boardgame", title: "Spirit Island", creator: "Greater Than Games", year: 2022, isbn: null, totalCopies: 10 },
  ];

  const insertItem = db.prepare(
    `INSERT INTO catalog_items (id, type, title, creator, year, isbn, description, tags, available, total_copies, available_copies)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
  );

  db.exec("BEGIN TRANSACTION");
  for (const item of items) {
    insertItem.run(
      item.id,
      item.type,
      item.title,
      item.creator,
      item.year,
      item.isbn,
      `A great ${item.type} for testing.`,
      JSON.stringify([item.type, "test"]),
      item.totalCopies,
      item.totalCopies
    );
  }
  db.exec("COMMIT");

  // ── Fixed test patron for integration tests ──────────────────────────
  const TEST_PATRON_ID = "00000000-0000-0000-0000-000000000001";
  const TEST_CARD_NUMBER = "0000-0000-TP";

  const insertPatron = db.prepare(
    `INSERT INTO patrons (id, username, name, card_number, created_at, is_seed)
     VALUES (?, ?, ?, ?, ?, 1)`
  );

  db.exec("BEGIN TRANSACTION");
  insertPatron.run(
    TEST_PATRON_ID,
    "test-patron",
    "Test Patron",
    TEST_CARD_NUMBER,
    new Date().toISOString().split("T")[0]
  );
  db.exec("COMMIT");
}
