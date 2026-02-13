import type { Database } from "bun:sqlite";
import { mintToken, storeToken, tokenExpiresAt } from "./tokens.ts";
import { DEFAULT_HUMAN_SCOPES, AGENT_SCOPES, stripNeverGranted } from "./scopes.ts";
import { upsertVisitor, linkAgent } from "../services/analytics.ts";

// ── Username generator ──────────────────────────────────────────────────

const ADJECTIVES = [
  "leaping", "clever", "swift", "gentle", "bold", "quiet", "bright", "daring",
  "eager", "happy", "lazy", "mighty", "noble", "proud", "wise", "calm",
  "fierce", "keen", "lively", "merry",
];

const ANIMALS = [
  "lizard", "falcon", "otter", "fox", "wolf", "bear", "hawk", "deer",
  "hare", "lynx", "crane", "eagle", "panda", "raven", "tiger", "whale",
  "koala", "moose", "robin", "shark",
];

function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function generateUsername(): string {
  return `${randomElement(ADJECTIVES)}-${randomElement(ANIMALS)}`;
}

// ── Card number generator ───────────────────────────────────────────────

const CARD_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function generateCardNumber(): string {
  let card = "";
  for (let i = 0; i < 10; i++) {
    card += CARD_CHARS[Math.floor(Math.random() * CARD_CHARS.length)];
  }
  // Format: XXXX-XXXX-XX
  return `${card.slice(0, 4)}-${card.slice(4, 8)}-${card.slice(8, 10)}`;
}

// ── Seed overdue items for a new patron ─────────────────────────────────

function seedOverdueItems(db: Database, patronId: string, patronName: string): void {
  // Pick 2-3 random catalog items from the DB
  const count = Math.random() < 0.5 ? 2 : 3;
  const items = db
    .prepare(
      `SELECT id FROM catalog_items WHERE available_copies > 0 ORDER BY RANDOM() LIMIT ?`
    )
    .all(count) as { id: string }[];

  for (const item of items) {
    const daysAgo = Math.floor(Math.random() * 30) + 15; // 15-44 days ago
    const checkoutDate = new Date(Date.now() - daysAgo * 86400000);
    const dueDate = new Date(checkoutDate.getTime() + 14 * 86400000);

    const lendingId = crypto.randomUUID();
    db.prepare(
      `INSERT INTO lending_history (id, item_id, patron_id, patron_name, checkout_date, due_date, return_date, days_late, is_seed)
       VALUES (?, ?, ?, ?, ?, ?, NULL, 0, 0)`
    ).run(
      lendingId,
      item.id,
      patronId,
      patronName,
      checkoutDate.toISOString().split("T")[0]!,
      dueDate.toISOString().split("T")[0]!,
    );

    // Decrement available copies
    db.prepare(
      `UPDATE catalog_items SET available_copies = available_copies - 1,
        available = CASE WHEN available_copies - 1 > 0 THEN 1 ELSE 0 END
       WHERE id = ?`
    ).run(item.id);
  }
}

// ── POST /auth — Human auth ─────────────────────────────────────────────

export async function handleHumanAuth(request: Request, db: Database): Promise<Response> {
  let body: { username?: string; scopes?: string[] } = {};
  try {
    body = (await request.json()) as { username?: string; scopes?: string[] };
  } catch {
    // Empty body is fine — we'll generate defaults
  }

  const username = body.username || generateUsername();
  const requestedScopes = body.scopes || [...DEFAULT_HUMAN_SCOPES];
  const scopes = stripNeverGranted(requestedScopes);

  // Look up existing patron by username
  const existingPatron = db
    .prepare(`SELECT id, card_number, name FROM patrons WHERE username = ?`)
    .get(username) as { id: string; card_number: string; name: string } | null;

  let patronId: string;
  let cardNumber: string;

  if (existingPatron) {
    patronId = existingPatron.id;
    cardNumber = existingPatron.card_number;
  } else {
    // Create new patron
    patronId = crypto.randomUUID();
    cardNumber = generateCardNumber();
    const patronName = username
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");

    db.prepare(
      `INSERT INTO patrons (id, username, name, card_number, created_at, is_seed)
       VALUES (?, ?, ?, ?, ?, 0)`
    ).run(patronId, username, patronName, cardNumber, new Date().toISOString());

    // Seed 2-3 overdue items for the new patron
    seedOverdueItems(db, patronId, patronName);
  }

  // Extract request metadata for analytics
  const ip = request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() || "unknown";
  const userAgent = request.headers.get("User-Agent") || "unknown";

  // Track visitor (fire-and-forget, never throws)
  const analyticsId = upsertVisitor(patronId, cardNumber, username, ip, userAgent);

  // Mint and store token
  const token = mintToken("demo");
  const expiresAt = tokenExpiresAt();

  storeToken(db, {
    token,
    tokenType: "demo",
    username,
    patronId,
    scopes,
    analyticsId,
    expiresAt,
    createdAt: new Date().toISOString(),
  });

  return new Response(
    JSON.stringify({
      token,
      username,
      cardNumber,
      scopes,
      expiresAt,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}

// ── POST /auth/agent — Agent auth ───────────────────────────────────────

const CARD_PATTERN = /^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{2}$/;

export async function handleAgentAuth(request: Request, db: Database): Promise<Response> {
  let body: { cardNumber?: string };
  try {
    body = (await request.json()) as { cardNumber?: string };
  } catch {
    return new Response(
      JSON.stringify({ error: { code: "INVALID_CARD", message: "Request body must be valid JSON with a cardNumber field" } }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const { cardNumber } = body;

  if (!cardNumber || !CARD_PATTERN.test(cardNumber)) {
    return new Response(
      JSON.stringify({ error: { code: "INVALID_CARD", message: "Card number must match format XXXX-XXXX-XX (alphanumeric)" } }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Look up patron by card_number
  const patron = db
    .prepare(`SELECT id, username, card_number FROM patrons WHERE card_number = ?`)
    .get(cardNumber) as { id: string; username: string; card_number: string } | null;

  if (!patron) {
    return new Response(
      JSON.stringify({ error: { code: "PATRON_NOT_FOUND", message: "No patron found with the given card number" } }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  // Extract request metadata for analytics
  const ip = request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() || "unknown";
  const userAgent = request.headers.get("User-Agent") || "unknown";

  // Link agent to visitor (fire-and-forget, never throws)
  const analyticsId = linkAgent(patron.id, patron.card_number, ip, userAgent);

  // Mint agent token
  const scopes = [...AGENT_SCOPES];
  const token = mintToken("agent");
  const expiresAt = tokenExpiresAt();

  storeToken(db, {
    token,
    tokenType: "agent",
    username: patron.username,
    patronId: patron.id,
    scopes,
    analyticsId,
    expiresAt,
    createdAt: new Date().toISOString(),
  });

  return new Response(
    JSON.stringify({
      token,
      username: patron.username,
      patronId: patron.id,
      cardNumber: patron.card_number,
      scopes,
      expiresAt,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}
