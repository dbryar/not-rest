// IMPORTANT: Set env vars before any module imports read them at module scope.
// Use in-memory DBs for both the API and the app to keep tests isolated.
process.env.DATABASE_PATH = `:memory:`;
process.env.SESSION_DB_PATH = `:memory:`;
process.env.AGENTS_URL = process.env.AGENTS_URL || "http://localhost:8888";
process.env.WWW_URL = process.env.WWW_URL || "http://localhost:8080";

import type { Server } from "bun";
import type { Database } from "bun:sqlite";

let apiServer: Server | null = null;
let appServer: Server | null = null;

// Ports chosen to avoid collisions with other dev servers
const API_PORT = parseInt(process.env.TEST_API_PORT || "19876", 10);
const APP_PORT = parseInt(process.env.TEST_APP_PORT || "19877", 10);

export const API_BASE = `http://localhost:${API_PORT}`;
export const APP_BASE = `http://localhost:${APP_PORT}`;

/**
 * Start both the API server and the App server.
 * The app server's API_URL is pointed at the API server.
 */
export async function startServers(): Promise<void> {
  // 1. Start the API server
  process.env.PORT = String(API_PORT);
  const { startServer: startApi } = await import("../../../api/src/server.ts");
  apiServer = await startApi();

  // Seed the in-memory API database with test data
  const { getDb: getApiDb } = await import("../../../api/src/db/connection.ts");
  seedApiTestDb(getApiDb());

  // 2. Start the App server with API_URL pointing to the test API server
  process.env.API_URL = API_BASE;
  delete process.env.PORT; // Clear so the app reads APP_PORT instead
  process.env.APP_PORT = String(APP_PORT);
  const { startServer: startApp } = await import("../../src/server.ts");
  appServer = startApp();
}

/**
 * Stop both servers and close databases.
 */
export async function stopServers(): Promise<void> {
  if (appServer) {
    appServer.stop(true);
    appServer = null;
  }
  if (apiServer) {
    apiServer.stop(true);
    apiServer = null;
  }

  // Close API database
  const { closeDb: closeApiDb } = await import("../../../api/src/db/connection.ts");
  closeApiDb();
}

// ── Helpers for test files ─────────────────────────────────────────────

/**
 * Authenticate with the API (POST /auth) and return token + metadata.
 * This creates a patron on the API side.
 */
export async function apiAuthenticate(opts?: {
  username?: string;
  scopes?: string[];
}): Promise<{
  token: string;
  username: string;
  cardNumber: string;
  scopes: string[];
  expiresAt: number;
}> {
  const res = await fetch(`${API_BASE}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts ?? {}),
  });
  if (res.status !== 200) {
    throw new Error(`API auth failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/**
 * Submit the app auth form (POST /auth) with form-encoded data.
 * Returns the raw Response (so callers can inspect headers, status, etc.).
 * Uses redirect: "manual" so we can examine the 302 and Set-Cookie.
 */
export async function appAuthSubmit(opts?: {
  username?: string;
  scopes?: string[];
}): Promise<Response> {
  const form = new URLSearchParams();
  if (opts?.username) form.set("username", opts.username);
  if (opts?.scopes) {
    for (const s of opts.scopes) form.append("scopes", s);
  }

  return fetch(`${APP_BASE}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
    redirect: "manual",
  });
}

/**
 * Parse a Set-Cookie header into its attributes.
 */
export function parseSetCookie(header: string): {
  name: string;
  value: string;
  attributes: Record<string, string | true>;
} {
  const parts = header.split(";").map((p) => p.trim());
  const [nameValue, ...rest] = parts;
  const eqIdx = nameValue!.indexOf("=");
  const name = nameValue!.slice(0, eqIdx);
  const value = nameValue!.slice(eqIdx + 1);

  const attributes: Record<string, string | true> = {};
  for (const attr of rest) {
    const [k, ...v] = attr.split("=");
    attributes[k!.trim().toLowerCase()] = v.length > 0 ? v.join("=").trim() : true;
  }

  return { name, value, attributes };
}

/**
 * Authenticate through the app flow: submit form, extract session cookie,
 * return the session cookie string for subsequent requests.
 */
export async function appLogin(opts?: {
  username?: string;
  scopes?: string[];
}): Promise<{ sid: string; cookie: string }> {
  const res = await appAuthSubmit(opts);
  const setCookie = res.headers.get("Set-Cookie");
  if (!setCookie) throw new Error("No Set-Cookie header from POST /auth");
  const parsed = parseSetCookie(setCookie);
  if (parsed.name !== "session") throw new Error(`Expected cookie name 'session', got '${parsed.name}'`);
  return { sid: parsed.value, cookie: `session=${parsed.value}` };
}

// ── API test data seeder ───────────────────────────────────────────────

function seedApiTestDb(db: Database): void {
  const existing = (
    db.prepare("SELECT COUNT(*) as c FROM catalog_items").get() as { c: number }
  ).c;
  if (existing > 0) return;

  const items = [
    { id: "item-book-001", type: "book", title: "The Crystal Garden", creator: "Alice Smith", year: 2020, isbn: "9781234567890", totalCopies: 20 },
    { id: "item-book-002", type: "book", title: "Journey to Midnight", creator: "Bob Johnson", year: 2019, isbn: "9781234567891", totalCopies: 20 },
    { id: "item-book-003", type: "book", title: "Secrets of the Tower", creator: "Charlie Davis", year: 2021, isbn: "9781234567892", totalCopies: 20 },
    { id: "item-dvd-001", type: "dvd", title: "City of Echoes", creator: "Sarah Chen", year: 2022, isbn: null, totalCopies: 10 },
    { id: "item-cd-001", type: "cd", title: "Midnight Sessions", creator: "The Blue Notes", year: 2021, isbn: null, totalCopies: 10 },
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
}
