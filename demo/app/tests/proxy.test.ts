import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import {
  startServers,
  stopServers,
  APP_BASE,
  API_BASE,
  appLogin,
  apiAuthenticate,
} from "./helpers/server.ts";

beforeAll(async () => {
  await startServers();
});

afterAll(async () => {
  await stopServers();
});

// ── POST /api/call — Proxy to API ─────────────────────────────────────

describe("POST /api/call", () => {
  test("forwards request to API and returns response + request metadata", async () => {
    const { cookie } = await appLogin({
      scopes: ["items:browse", "items:read"],
    });

    const res = await fetch(`${APP_BASE}/api/call`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify({ op: "v1:catalog.list", args: {} }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();

    // Should contain response (the API response)
    expect(body).toHaveProperty("response");
    expect(body).toHaveProperty("status");

    // Should contain request metadata showing what was sent to the API
    expect(body).toHaveProperty("request");
    expect(body.request).toHaveProperty("method", "POST");
    expect(body.request).toHaveProperty("url");
    expect(body.request.url).toContain("/call");
    expect(body.request).toHaveProperty("headers");
    expect(body.request).toHaveProperty("body");
  });

  test("masks token in returned request metadata", async () => {
    const { cookie } = await appLogin({
      scopes: ["items:browse", "items:read"],
    });

    const res = await fetch(`${APP_BASE}/api/call`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify({ op: "v1:catalog.list", args: {} }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();

    // The Authorization header in the request metadata should be masked
    const authHeader = body.request.headers["Authorization"] as string;
    expect(authHeader).toBeDefined();
    expect(authHeader).toContain("***");
    // Should show the prefix (e.g., "Bearer demo_***")
    expect(authHeader).toMatch(/^Bearer \w+_\*\*\*$/);
    // Should NOT contain the actual full token
    expect(authHeader).not.toMatch(/^Bearer demo_[a-f0-9]{20,}$/);
  });

  test("returns X-AI-Instructions header", async () => {
    const { cookie } = await appLogin({
      scopes: ["items:browse", "items:read"],
    });

    const res = await fetch(`${APP_BASE}/api/call`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify({ op: "v1:catalog.list", args: {} }),
    });

    expect(res.headers.get("X-AI-Instructions")).toBe(
      "https://agents.opencall-api.com/"
    );
  });

  test("redirects to /auth when no session cookie is present", async () => {
    const res = await fetch(`${APP_BASE}/api/call`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "v1:catalog.list", args: {} }),
      redirect: "manual",
    });

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/auth");
  });

  test("forwards API error responses for unknown operations", async () => {
    const { cookie } = await appLogin({
      scopes: ["items:browse", "items:read"],
    });

    const res = await fetch(`${APP_BASE}/api/call`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify({ op: "v1:nonexistent.op", args: {} }),
    });

    const body = await res.json();
    // The API should return an error for unknown operations,
    // and the proxy should forward it along with request metadata
    expect(body).toHaveProperty("response");
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("request");
  });

  test("API response body is forwarded for catalog.list", async () => {
    const { cookie } = await appLogin({
      scopes: ["items:browse", "items:read"],
    });

    const res = await fetch(`${APP_BASE}/api/call`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify({ op: "v1:catalog.list", args: {} }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();

    // The response from the API should contain result data
    expect(body.response).toBeDefined();
    // catalog.list should return a result with items
    expect(body.response).toHaveProperty("state", "complete");
    expect(body.response).toHaveProperty("result");
  });
});

// ── POST /api/auth/agent — Agent auth proxy ───────────────────────────

describe("POST /api/auth/agent", () => {
  test("proxies agent auth to the API and returns result", async () => {
    // First authenticate directly with the API to get a card number
    const authData = await apiAuthenticate();
    const cardNumber = authData.cardNumber;

    // Now call the agent auth proxy through the app
    const res = await fetch(`${APP_BASE}/api/auth/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardNumber }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("token");
    expect(body.token).toMatch(/^agent_/);
    expect(body).toHaveProperty("cardNumber", cardNumber);
  });

  test("returns error for invalid card number", async () => {
    const res = await fetch(`${APP_BASE}/api/auth/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardNumber: "bad-format" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});
