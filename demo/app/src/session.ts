import { getDb } from "./db/connection.ts";

export interface Session {
  sid: string;
  token: string;
  username: string;
  cardNumber: string;
  scopes: string[];
  analyticsVisitorId: string | null;
  expiresAt: number;
  createdAt: string;
}

interface CreateSessionData {
  token: string;
  username: string;
  cardNumber: string;
  scopes: string[];
  analyticsVisitorId?: string | null;
  expiresAt: number;
}

export function createSession(data: CreateSessionData): Session {
  const db = getDb();
  const sid = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const analyticsVisitorId = data.analyticsVisitorId ?? null;

  db.prepare(
    `INSERT INTO sessions (sid, token, username, card_number, scopes, analytics_visitor_id, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    sid,
    data.token,
    data.username,
    data.cardNumber,
    JSON.stringify(data.scopes),
    analyticsVisitorId,
    data.expiresAt,
    createdAt
  );

  return {
    sid,
    token: data.token,
    username: data.username,
    cardNumber: data.cardNumber,
    scopes: data.scopes,
    analyticsVisitorId,
    expiresAt: data.expiresAt,
    createdAt,
  };
}

export function getSession(sid: string): Session | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT sid, token, username, card_number, scopes, analytics_visitor_id, expires_at, created_at
       FROM sessions WHERE sid = ?`
    )
    .get(sid) as {
      sid: string;
      token: string;
      username: string;
      card_number: string;
      scopes: string;
      analytics_visitor_id: string | null;
      expires_at: number;
      created_at: string;
    } | null;

  if (!row) return null;

  // Check if session has expired
  const nowEpoch = Math.floor(Date.now() / 1000);
  if (row.expires_at <= nowEpoch) {
    // Clean up expired session
    deleteSession(row.sid);
    return null;
  }

  return {
    sid: row.sid,
    token: row.token,
    username: row.username,
    cardNumber: row.card_number,
    scopes: JSON.parse(row.scopes) as string[],
    analyticsVisitorId: row.analytics_visitor_id,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

export function deleteSession(sid: string): void {
  const db = getDb();
  db.prepare(`DELETE FROM sessions WHERE sid = ?`).run(sid);
}

export function clearAllSessions(): void {
  const db = getDb();
  db.prepare(`DELETE FROM sessions`).run();
}
