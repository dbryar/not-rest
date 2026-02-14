import { getDb } from "../db/connection.ts";

/**
 * Fire-and-forget analytics tracking service.
 * All functions catch and swallow errors — they log to console.error but never throw.
 */

/**
 * Upsert a visitor record on human auth.
 * Match on (ip, user_agent) combination. If found: update patron_id, card_number,
 * username, updated_at. If not found: insert new row with a generated UUID id.
 * Returns the visitor id or null on error.
 */
export function upsertVisitor(
  patronId: string,
  cardNumber: string,
  username: string,
  ip: string,
  userAgent: string
): string | null {
  try {
    const db = getDb();
    const now = new Date().toISOString();

    // Check for existing visitor by (ip, user_agent)
    const existing = db
      .prepare(`SELECT id FROM analytics_visitors WHERE ip = ? AND user_agent = ?`)
      .get(ip, userAgent) as { id: string } | null;

    if (existing) {
      db.prepare(
        `UPDATE analytics_visitors
         SET patron_id = ?, card_number = ?, username = ?, updated_at = ?
         WHERE id = ?`
      ).run(patronId, cardNumber, username, now, existing.id);
      return existing.id;
    }

    // Insert new visitor
    const id = crypto.randomUUID();
    db.prepare(
      `INSERT INTO analytics_visitors (id, patron_id, card_number, username, user_agent, ip, page_views, api_calls, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`
    ).run(id, patronId, cardNumber, username, userAgent, ip, now, now);
    return id;
  } catch (err) {
    console.error("analytics.upsertVisitor failed:", err);
    return null;
  }
}

/**
 * Link an agent to a visitor on agent auth.
 * Look up the visitor by card_number, then insert an analytics_agents row
 * with the visitor_id FK.
 * Returns the agent analytics id or null on error.
 */
export function linkAgent(
  patronId: string,
  cardNumber: string,
  ip: string,
  userAgent: string
): string | null {
  try {
    const db = getDb();
    const now = new Date().toISOString();

    // Look up visitor by card_number
    const visitor = db
      .prepare(`SELECT id FROM analytics_visitors WHERE card_number = ?`)
      .get(cardNumber) as { id: string } | null;

    if (!visitor) {
      console.error("analytics.linkAgent: no visitor found for card_number", cardNumber);
      return null;
    }

    const id = crypto.randomUUID();
    db.prepare(
      `INSERT INTO analytics_agents (id, visitor_id, patron_id, card_number, user_agent, ip, api_calls, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`
    ).run(id, visitor.id, patronId, cardNumber, userAgent, ip, now, now);
    return id;
  } catch (err) {
    console.error("analytics.linkAgent failed:", err);
    return null;
  }
}

/**
 * Fire-and-forget: increment page views for a visitor by id.
 */
export function incrementPageViews(visitorId: string): void {
  try {
    const db = getDb();
    db.prepare(
      `UPDATE analytics_visitors SET page_views = page_views + 1, updated_at = ? WHERE id = ?`
    ).run(new Date().toISOString(), visitorId);
  } catch (err) {
    console.error("analytics.incrementPageViews failed:", err);
  }
}

/**
 * Fire-and-forget: increment API calls.
 * For demo tokens, increment on analytics_visitors.
 * For agent tokens, increment on analytics_agents.
 */
export function incrementApiCalls(analyticsId: string, tokenType: "demo" | "agent"): void {
  try {
    const db = getDb();
    const now = new Date().toISOString();

    if (tokenType === "demo") {
      db.prepare(
        `UPDATE analytics_visitors SET api_calls = api_calls + 1, updated_at = ? WHERE id = ?`
      ).run(now, analyticsId);
    } else {
      db.prepare(
        `UPDATE analytics_agents SET api_calls = api_calls + 1, updated_at = ? WHERE id = ?`
      ).run(now, analyticsId);
    }
  } catch (err) {
    console.error("analytics.incrementApiCalls failed:", err);
  }
}
