import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { startServer, stopServer } from "./helpers/server.ts";

const BASE_URL = `http://localhost:${process.env.TEST_PORT || 9876}`;
const APP_ORIGIN = "http://localhost:8000";

beforeAll(async () => {
  await startServer();
});

afterAll(async () => {
  await stopServer();
});

// ── CORS Preflight (OPTIONS) ─────────────────────────────────────────────

describe("CORS preflight", () => {
  test("OPTIONS /call returns 204 with CORS headers", async () => {
    const res = await fetch(`${BASE_URL}/call`, {
      method: "OPTIONS",
      headers: {
        Origin: APP_ORIGIN,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type, Authorization",
      },
    });

    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(APP_ORIGIN);
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
    expect(res.headers.get("Access-Control-Allow-Headers")).toContain("Authorization");
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
  });

  test("OPTIONS /auth returns 204 with CORS headers", async () => {
    const res = await fetch(`${BASE_URL}/auth`, {
      method: "OPTIONS",
      headers: {
        Origin: APP_ORIGIN,
        "Access-Control-Request-Method": "POST",
      },
    });

    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(APP_ORIGIN);
  });

  test("OPTIONS with disallowed origin returns empty Access-Control-Allow-Origin", async () => {
    const res = await fetch(`${BASE_URL}/call`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://evil.com",
        "Access-Control-Request-Method": "POST",
      },
    });

    expect(res.status).toBe(204);
    // Should not allow the evil origin
    expect(res.headers.get("Access-Control-Allow-Origin")).not.toBe("http://evil.com");
  });
});

// ── CORS Response Headers ────────────────────────────────────────────────

describe("CORS response headers", () => {
  test("POST /call includes CORS headers in response", async () => {
    const res = await fetch(`${BASE_URL}/call`, {
      method: "POST",
      headers: {
        Origin: APP_ORIGIN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ op: "v1:catalog.list", args: {} }),
    });

    // Should have CORS headers (even on 401 since no token)
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(APP_ORIGIN);
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
  });

  test("POST /auth includes CORS headers in response", async () => {
    const res = await fetch(`${BASE_URL}/auth`, {
      method: "POST",
      headers: {
        Origin: APP_ORIGIN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(APP_ORIGIN);
  });

  test("GET /.well-known/ops includes CORS headers", async () => {
    const res = await fetch(`${BASE_URL}/.well-known/ops`, {
      headers: {
        Origin: APP_ORIGIN,
      },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(APP_ORIGIN);
  });

  test("error responses include CORS headers", async () => {
    const res = await fetch(`${BASE_URL}/call`, {
      method: "POST",
      headers: {
        Origin: APP_ORIGIN,
        "Content-Type": "application/json",
        // No Authorization header - will get 401
      },
      body: JSON.stringify({ op: "v1:catalog.list", args: {} }),
    });

    expect(res.status).toBe(401);
    // CORS headers must be present even on errors
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(APP_ORIGIN);
  });
});
