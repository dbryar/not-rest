import { test, expect, describe, beforeAll, afterAll } from "bun:test";

// Set env before imports so the session DB uses in-memory SQLite
process.env.SESSION_DB_PATH = `:memory:`;

import { createSession, getSession, deleteSession, clearAllSessions } from "../src/session.ts";
import { getDb, closeDb } from "../src/db/connection.ts";

beforeAll(() => {
  // Initialize the in-memory session database
  getDb();
});

afterAll(() => {
  closeDb();
});

// ── createSession ──────────────────────────────────────────────────────

describe("createSession", () => {
  test("returns a session with a valid UUID sid", () => {
    const session = createSession({
      token: "demo_test123",
      username: "test-user",
      cardNumber: "AbCd-EfGh-Ij",
      scopes: ["items:browse", "items:read"],
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    });

    expect(session.sid).toBeDefined();
    // UUID v4 format
    expect(session.sid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
    expect(session.token).toBe("demo_test123");
    expect(session.username).toBe("test-user");
    expect(session.cardNumber).toBe("AbCd-EfGh-Ij");
    expect(session.scopes).toEqual(["items:browse", "items:read"]);
    expect(session.createdAt).toBeDefined();
  });

  test("stores analyticsVisitorId when provided", () => {
    const session = createSession({
      token: "demo_analytics1",
      username: "analytics-user",
      cardNumber: "XyZw-AbCd-Ef",
      scopes: ["items:browse"],
      analyticsVisitorId: "visitor-123",
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    });

    expect(session.analyticsVisitorId).toBe("visitor-123");
  });

  test("defaults analyticsVisitorId to null when not provided", () => {
    const session = createSession({
      token: "demo_noanalytics",
      username: "no-analytics-user",
      cardNumber: "AbCd-XxYy-Zz",
      scopes: ["items:browse"],
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    });

    expect(session.analyticsVisitorId).toBeNull();
  });
});

// ── getSession ─────────────────────────────────────────────────────────

describe("getSession", () => {
  test("retrieves a stored session by sid", () => {
    const created = createSession({
      token: "demo_getsess",
      username: "get-user",
      cardNumber: "GeTu-SeSs-Ab",
      scopes: ["items:browse", "patron:read"],
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    });

    const retrieved = getSession(created.sid);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.sid).toBe(created.sid);
    expect(retrieved!.token).toBe("demo_getsess");
    expect(retrieved!.username).toBe("get-user");
    expect(retrieved!.cardNumber).toBe("GeTu-SeSs-Ab");
    expect(retrieved!.scopes).toEqual(["items:browse", "patron:read"]);
  });

  test("returns null for a non-existent sid", () => {
    const result = getSession("non-existent-sid-00000000");
    expect(result).toBeNull();
  });

  test("returns null for an expired session and cleans it up", () => {
    // Create a session that already expired (expiresAt in the past)
    const pastEpoch = Math.floor(Date.now() / 1000) - 100;
    const created = createSession({
      token: "demo_expired",
      username: "expired-user",
      cardNumber: "ExPr-SeSs-Ab",
      scopes: ["items:browse"],
      expiresAt: pastEpoch,
    });

    // Should return null because it's expired
    const retrieved = getSession(created.sid);
    expect(retrieved).toBeNull();

    // Verify the row was actually deleted (cleaned up)
    const db = getDb();
    const row = db.prepare("SELECT sid FROM sessions WHERE sid = ?").get(created.sid);
    expect(row).toBeNull();
  });
});

// ── deleteSession ──────────────────────────────────────────────────────

describe("deleteSession", () => {
  test("removes a session so getSession returns null", () => {
    const created = createSession({
      token: "demo_deleteme",
      username: "delete-user",
      cardNumber: "DeLe-TeSs-Ab",
      scopes: ["items:browse"],
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    });

    // Confirm it exists
    expect(getSession(created.sid)).not.toBeNull();

    // Delete and confirm it's gone
    deleteSession(created.sid);
    expect(getSession(created.sid)).toBeNull();
  });

  test("does not throw when deleting a non-existent sid", () => {
    expect(() => deleteSession("does-not-exist")).not.toThrow();
  });
});

// ── clearAllSessions ───────────────────────────────────────────────────

describe("clearAllSessions", () => {
  test("removes all sessions from the database", () => {
    // Create several sessions
    const s1 = createSession({
      token: "demo_clear1",
      username: "clear-user-1",
      cardNumber: "ClEa-RaLl-01",
      scopes: ["items:browse"],
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    });
    const s2 = createSession({
      token: "demo_clear2",
      username: "clear-user-2",
      cardNumber: "ClEa-RaLl-02",
      scopes: ["items:read"],
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    });

    // Confirm they exist
    expect(getSession(s1.sid)).not.toBeNull();
    expect(getSession(s2.sid)).not.toBeNull();

    // Clear all
    clearAllSessions();

    // Confirm all gone
    expect(getSession(s1.sid)).toBeNull();
    expect(getSession(s2.sid)).toBeNull();
  });
});
