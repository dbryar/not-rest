import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import {
  startServers,
  stopServers,
  APP_BASE,
  appAuthSubmit,
  appLogin,
  parseSetCookie,
} from "./helpers/server.ts";

beforeAll(async () => {
  await startServers();
});

afterAll(async () => {
  await stopServers();
});

// ── GET /auth — Auth page ─────────────────────────────────────────────

describe("GET /auth", () => {
  test("returns 200 with HTML page", async () => {
    const res = await fetch(`${APP_BASE}/auth`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
  });

  test("contains the auth form", async () => {
    const res = await fetch(`${APP_BASE}/auth`);
    const html = await res.text();
    expect(html).toContain('<form method="POST" action="/auth"');
    expect(html).toContain('name="username"');
    expect(html).toContain('name="scopes"');
    expect(html).toContain("Sign In");
  });

  test("contains X-AI-Instructions header", async () => {
    const res = await fetch(`${APP_BASE}/auth`);
    expect(res.headers.get("X-AI-Instructions")).toBe(
      "https://agents.opencall-api.com/"
    );
  });

  test("contains ai-instructions meta tag", async () => {
    const res = await fetch(`${APP_BASE}/auth`);
    const html = await res.text();
    expect(html).toContain('meta name="ai-instructions"');
    expect(html).toContain("https://agents.opencall-api.com/");
  });

  test("shows reset banner when ?reset=1", async () => {
    const res = await fetch(`${APP_BASE}/auth?reset=1`);
    const html = await res.text();
    expect(html).toContain("demo library has been reset");
  });
});

// ── POST /auth — Form submission ──────────────────────────────────────

describe("POST /auth", () => {
  test("creates session and redirects to / with 302", async () => {
    const res = await appAuthSubmit({
      scopes: ["items:browse", "items:read"],
    });

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/");
  });

  test("sets session cookie with correct attributes", async () => {
    const res = await appAuthSubmit({
      scopes: ["items:browse", "items:read"],
    });

    const setCookie = res.headers.get("Set-Cookie");
    expect(setCookie).not.toBeNull();

    const parsed = parseSetCookie(setCookie!);
    expect(parsed.name).toBe("sid");
    expect(parsed.value).toBeTruthy();
    // UUID format
    expect(parsed.value).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );

    // Check cookie attributes
    expect(parsed.attributes).toHaveProperty("httponly", true);
    expect(parsed.attributes).toHaveProperty("samesite", "Lax");
    expect(parsed.attributes).toHaveProperty("path", "/");
    expect(parsed.attributes).toHaveProperty("max-age");
    // Max-Age should be a positive number
    const maxAge = parseInt(parsed.attributes["max-age"] as string, 10);
    expect(maxAge).toBeGreaterThan(0);
  });

  test("session cookie works for authenticated routes", async () => {
    const res = await appAuthSubmit({
      scopes: ["items:browse", "items:read"],
    });

    const setCookie = res.headers.get("Set-Cookie")!;
    const parsed = parseSetCookie(setCookie);
    const cookie = `sid=${parsed.value}`;

    // Use the session cookie to access dashboard
    const dashRes = await fetch(`${APP_BASE}/`, {
      headers: { Cookie: cookie },
    });
    expect(dashRes.status).toBe(200);
    const html = await dashRes.text();
    expect(html).toContain("Dashboard");
  });
});

// ── Session-protected routes ──────────────────────────────────────────

describe("Session-protected routes", () => {
  test("GET / without session redirects to /auth", async () => {
    const res = await fetch(`${APP_BASE}/`, { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/auth");
  });

  test("GET /catalog without session redirects to /auth", async () => {
    const res = await fetch(`${APP_BASE}/catalog`, { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/auth");
  });

  test("GET /account without session redirects to /auth", async () => {
    const res = await fetch(`${APP_BASE}/account`, { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/auth");
  });

  test("GET /reports without session redirects to /auth", async () => {
    const res = await fetch(`${APP_BASE}/reports`, { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/auth");
  });

  test("invalid session cookie redirects to /auth", async () => {
    const res = await fetch(`${APP_BASE}/`, {
      headers: { Cookie: "sid=invalid-session-id-that-does-not-exist" },
      redirect: "manual",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/auth");
  });

  test("GET / with valid session returns dashboard HTML", async () => {
    const { cookie } = await appLogin({
      scopes: ["items:browse", "items:read"],
    });

    const res = await fetch(`${APP_BASE}/`, {
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Dashboard");
    expect(html).toContain("OpenCALL");
  });

  test("GET /catalog with valid session returns catalog HTML", async () => {
    const { cookie } = await appLogin({
      scopes: ["items:browse", "items:read"],
    });

    const res = await fetch(`${APP_BASE}/catalog`, {
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Catalog");
  });

  test("GET /account with valid session returns account HTML", async () => {
    const { cookie } = await appLogin({
      scopes: ["items:browse", "items:read", "patron:read"],
    });

    const res = await fetch(`${APP_BASE}/account`, {
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Account");
  });

  test("GET /reports with valid session returns reports HTML", async () => {
    const { cookie } = await appLogin({
      scopes: ["items:browse", "reports:generate"],
    });

    const res = await fetch(`${APP_BASE}/reports`, {
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Reports");
  });

  test("GET /catalog/:id with valid session returns item detail HTML", async () => {
    const { cookie } = await appLogin({
      scopes: ["items:browse", "items:read"],
    });

    const res = await fetch(`${APP_BASE}/catalog/item-book-001`, {
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("item-book-001");
    expect(html).toContain("Item Detail");
  });
});

// ── GET /logout ───────────────────────────────────────────────────────

describe("GET /logout", () => {
  test("redirects to /auth with 302", async () => {
    const { cookie } = await appLogin();

    const res = await fetch(`${APP_BASE}/logout`, {
      headers: { Cookie: cookie },
      redirect: "manual",
    });

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/auth");
  });

  test("clears session cookie with Max-Age=0", async () => {
    const { cookie } = await appLogin();

    const res = await fetch(`${APP_BASE}/logout`, {
      headers: { Cookie: cookie },
      redirect: "manual",
    });

    const setCookie = res.headers.get("Set-Cookie");
    expect(setCookie).not.toBeNull();
    const parsed = parseSetCookie(setCookie!);
    expect(parsed.name).toBe("sid");
    expect(parsed.value).toBe("");
    expect(parsed.attributes["max-age"]).toBe("0");
  });

  test("session is invalidated after logout", async () => {
    const { cookie } = await appLogin();

    // Confirm session works before logout
    const beforeRes = await fetch(`${APP_BASE}/`, {
      headers: { Cookie: cookie },
    });
    expect(beforeRes.status).toBe(200);

    // Logout
    await fetch(`${APP_BASE}/logout`, {
      headers: { Cookie: cookie },
      redirect: "manual",
    });

    // Session should be invalid now
    const afterRes = await fetch(`${APP_BASE}/`, {
      headers: { Cookie: cookie },
      redirect: "manual",
    });
    expect(afterRes.status).toBe(302);
    expect(afterRes.headers.get("Location")).toBe("/auth");
  });
});

// ── Static assets and special routes ──────────────────────────────────

describe("Static and special routes", () => {
  test("GET /app.css returns CSS content", async () => {
    const res = await fetch(`${APP_BASE}/app.css`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/css");
  });

  test("GET /app.js returns JavaScript content", async () => {
    const res = await fetch(`${APP_BASE}/app.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/javascript");
  });

  test("GET /robots.txt returns robots content", async () => {
    const res = await fetch(`${APP_BASE}/robots.txt`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("User-agent: *");
    expect(text).toContain("agents.opencall-api.com");
  });

  test("GET /.well-known/ai-instructions redirects to agent instructions", async () => {
    const res = await fetch(`${APP_BASE}/.well-known/ai-instructions`, {
      redirect: "manual",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe(
      "https://agents.opencall-api.com/"
    );
  });

  test("GET /nonexistent returns 404", async () => {
    const res = await fetch(`${APP_BASE}/nonexistent`);
    expect(res.status).toBe(404);
    const html = await res.text();
    expect(html).toContain("404");
  });

  test("POST /api/reset clears app sessions", async () => {
    // Create a session first
    const { cookie } = await appLogin();

    // Confirm session works
    const beforeRes = await fetch(`${APP_BASE}/`, {
      headers: { Cookie: cookie },
    });
    expect(beforeRes.status).toBe(200);

    // Reset sessions
    const resetRes = await fetch(`${APP_BASE}/api/reset`, {
      method: "POST",
    });
    expect(resetRes.status).toBe(200);

    // Session should be gone
    const afterRes = await fetch(`${APP_BASE}/`, {
      headers: { Cookie: cookie },
      redirect: "manual",
    });
    expect(afterRes.status).toBe(302);
  });
});
