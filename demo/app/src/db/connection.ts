import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";

const DB_PATH = process.env.SESSION_DB_PATH || "./sessions.db";

let db: Database | null = null;

export function getDb(): Database {
  if (!db) {
    db = new Database(DB_PATH, { create: true });
    db.exec("PRAGMA journal_mode = WAL;");
    initSchema(db);
  }
  return db;
}

function initSchema(database: Database): void {
  const schemaPath = join(dirname(new URL(import.meta.url).pathname), "schema.sql");
  const schema = readFileSync(schemaPath, "utf-8");
  database.exec(schema);
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
