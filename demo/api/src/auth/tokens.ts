import type { Database } from "bun:sqlite";

/** Shape of an auth token as stored/retrieved */
export interface AuthToken {
  token: string;
  tokenType: "demo" | "agent";
  username: string;
  patronId: string;
  scopes: string[];
  analyticsId: string | null;
  expiresAt: number; // Unix epoch seconds
  createdAt: string; // ISO 8601
}

/** Data required to store a new token */
export interface TokenData {
  token: string;
  tokenType: "demo" | "agent";
  username: string;
  patronId: string;
  scopes: string[];
  analyticsId?: string | null;
  expiresAt: number;
  createdAt: string;
}

/** Generate a token string with a type prefix + 32 random hex chars */
export function mintToken(type: "demo" | "agent"): string {
  const prefix = type === "demo" ? "demo_" : "agent_";
  const bytes = new Uint8Array(16); // 16 bytes = 32 hex chars
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${prefix}${hex}`;
}

/** Insert a token record into the auth_tokens table */
export function storeToken(db: Database, data: TokenData): void {
  const stmt = db.prepare(
    `INSERT INTO auth_tokens (token, token_type, username, patron_id, scopes, analytics_id, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  stmt.run(
    data.token,
    data.tokenType,
    data.username,
    data.patronId,
    JSON.stringify(data.scopes),
    data.analyticsId ?? null,
    data.expiresAt,
    data.createdAt
  );
}

/** Look up a token from the database, returning a parsed AuthToken or null */
export function lookupToken(db: Database, token: string): AuthToken | null {
  const stmt = db.prepare(
    `SELECT token, token_type, username, patron_id, scopes, analytics_id, expires_at, created_at
     FROM auth_tokens WHERE token = ?`
  );
  const row = stmt.get(token) as {
    token: string;
    token_type: string;
    username: string;
    patron_id: string;
    scopes: string;
    analytics_id: string | null;
    expires_at: number;
    created_at: string;
  } | null;

  if (!row) return null;

  return {
    token: row.token,
    tokenType: row.token_type as "demo" | "agent",
    username: row.username,
    patronId: row.patron_id,
    scopes: JSON.parse(row.scopes) as string[],
    analyticsId: row.analytics_id,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

/** Default token expiry: 24 hours from now (in seconds) */
export function tokenExpiresAt(): number {
  return Math.floor(Date.now() / 1000) + 86400;
}
