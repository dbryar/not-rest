import { test, expect, describe } from "bun:test";
import { createSession, resolveSession } from "../src/session.ts";

// ── createSession ──────────────────────────────────────────────────────

describe("createSession", () => {
  test("returns a signed cookie string in base64url.base64url format", () => {
    const cookie = createSession({
      token: "demo_test123",
      username: "test-user",
      cardNumber: "AbCd-EfGh-Ij",
      scopes: ["items:browse", "items:read"],
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    });

    expect(typeof cookie).toBe("string");
    expect(cookie).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });

  test("includes analyticsVisitorId when provided", () => {
    const cookie = createSession({
      token: "demo_analytics1",
      username: "analytics-user",
      cardNumber: "XyZw-AbCd-Ef",
      scopes: ["items:browse"],
      analyticsVisitorId: "visitor-123",
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    });

    const session = resolveSession(cookie);
    expect(session).not.toBeNull();
    expect(session!.analyticsVisitorId).toBe("visitor-123");
  });

  test("defaults analyticsVisitorId to null when not provided", () => {
    const cookie = createSession({
      token: "demo_noanalytics",
      username: "no-analytics-user",
      cardNumber: "AbCd-XxYy-Zz",
      scopes: ["items:browse"],
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    });

    const session = resolveSession(cookie);
    expect(session).not.toBeNull();
    expect(session!.analyticsVisitorId).toBeNull();
  });
});

// ── resolveSession ────────────────────────────────────────────────────

describe("resolveSession", () => {
  test("round-trips session data through sign/verify", () => {
    const cookie = createSession({
      token: "demo_getsess",
      username: "get-user",
      cardNumber: "GeTu-SeSs-Ab",
      scopes: ["items:browse", "patron:read"],
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    });

    const session = resolveSession(cookie);
    expect(session).not.toBeNull();
    expect(session!.token).toBe("demo_getsess");
    expect(session!.username).toBe("get-user");
    expect(session!.cardNumber).toBe("GeTu-SeSs-Ab");
    expect(session!.scopes).toEqual(["items:browse", "patron:read"]);
  });

  test("returns null for a tampered cookie", () => {
    const cookie = createSession({
      token: "demo_tamper",
      username: "tamper-user",
      cardNumber: "TaMp-ErEd-Ab",
      scopes: ["items:browse"],
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    });

    // Tamper with the payload
    const tampered = "x" + cookie.slice(1);
    expect(resolveSession(tampered)).toBeNull();
  });

  test("returns null for an expired session", () => {
    const pastEpoch = Math.floor(Date.now() / 1000) - 100;
    const cookie = createSession({
      token: "demo_expired",
      username: "expired-user",
      cardNumber: "ExPr-SeSs-Ab",
      scopes: ["items:browse"],
      expiresAt: pastEpoch,
    });

    expect(resolveSession(cookie)).toBeNull();
  });

  test("returns null for garbage input", () => {
    expect(resolveSession("not-a-valid-cookie")).toBeNull();
    expect(resolveSession("")).toBeNull();
    expect(resolveSession("a.b.c")).toBeNull();
  });
});
