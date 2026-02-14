import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { startServer, stopServer } from "./helpers/server.ts";
import { call, authenticate, getRaw } from "./helpers/client.ts";

const BASE_URL = `http://localhost:${process.env.TEST_PORT || 9876}`;

beforeAll(async () => {
  await startServer();
});

afterAll(async () => {
  await stopServer();
});

describe("Error handling", () => {
  let token: string;

  beforeAll(async () => {
    const auth = await authenticate();
    token = auth.body.token;
  });

  test("400 INVALID_ENVELOPE: missing op field (send {})", async () => {
    const res = await fetch(`${BASE_URL}/call`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.state).toBe("error");
    expect(body.error.code).toBe("INVALID_ENVELOPE");
    expect(typeof body.error.message).toBe("string");
    expect(body.error.message.length).toBeGreaterThan(0);
  });

  test("400 INVALID_ENVELOPE: invalid JSON body (send 'not json')", async () => {
    const res = await fetch(`${BASE_URL}/call`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: "not json",
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.state).toBe("error");
    expect(body.error.code).toBe("INVALID_ENVELOPE");
    expect(typeof body.error.message).toBe("string");
    expect(body.error.message.length).toBeGreaterThan(0);
  });

  test("400 UNKNOWN_OPERATION: unregistered operation", async () => {
    const res = await call("v1:fake.op", {}, undefined, token);
    expect(res.status).toBe(400);
    expect(res.body.state).toBe("error");
    expect(res.body.error!.code).toBe("UNKNOWN_OPERATION");
    expect(typeof res.body.error!.message).toBe("string");
    expect(res.body.error!.message.length).toBeGreaterThan(0);
  });

  test("400 SCHEMA_VALIDATION_FAILED: invalid args", async () => {
    const res = await call(
      "v1:catalog.list",
      { limit: "not a number" },
      undefined,
      token
    );
    expect(res.status).toBe(400);
    expect(res.body.state).toBe("error");
    expect(res.body.error!.code).toBe("SCHEMA_VALIDATION_FAILED");
    expect(typeof res.body.error!.message).toBe("string");
    expect(res.body.error!.message.length).toBeGreaterThan(0);
  });

  test("401 AUTH_REQUIRED: missing Authorization header", async () => {
    const res = await call("v1:catalog.list", {});
    expect(res.status).toBe(401);
    expect(res.body.state).toBe("error");
    expect(res.body.error!.code).toBe("AUTH_REQUIRED");
    expect(typeof res.body.error!.message).toBe("string");
    expect(res.body.error!.message.length).toBeGreaterThan(0);
  });

  test("403 INSUFFICIENT_SCOPES: valid token but missing scope", async () => {
    const res = await call("v1:patron.fines", {}, undefined, token);
    expect(res.status).toBe(403);
    expect(res.body.state).toBe("error");
    expect(res.body.error!.code).toBe("INSUFFICIENT_SCOPES");
    expect(typeof res.body.error!.message).toBe("string");
    expect(res.body.error!.message.length).toBeGreaterThan(0);
  });

  test("405 METHOD_NOT_ALLOWED: GET /call returns 405 with Allow: POST header", async () => {
    const res = await getRaw("/call");
    expect(res.status).toBe(405);

    expect(res.headers.get("Allow")).toBe("POST");

    const body = await res.body.json();
    expect(body.state).toBe("error");
    expect(body.error.code).toBe("METHOD_NOT_ALLOWED");
    expect(typeof body.error.message).toBe("string");
    expect(body.error.message.length).toBeGreaterThan(0);
  });

  test("domain errors return HTTP 200 with state=error", async () => {
    const res = await call("v1:item.get", { itemId: "nonexistent-xyz" }, undefined, token);
    expect(res.status).toBe(200);
    expect(res.body.state).toBe("error");
    expect(res.body.error!.code).toBe("ITEM_NOT_FOUND");
    expect(typeof res.body.error!.message).toBe("string");
    expect(res.body.error!.message.length).toBeGreaterThan(0);
  });

  test("every error response has a non-empty message field", async () => {
    // Test several error conditions and verify message is always present and non-empty
    const errors = [
      // AUTH_REQUIRED
      await call("v1:catalog.list", {}),
      // UNKNOWN_OPERATION
      await call("v1:nonexistent.op", {}, undefined, token),
      // SCHEMA_VALIDATION_FAILED
      await call("v1:catalog.list", { limit: "bad" }, undefined, token),
      // INSUFFICIENT_SCOPES
      await call("v1:patron.fines", {}, undefined, token),
      // Domain error
      await call("v1:item.get", { itemId: "no-such-item" }, undefined, token),
    ];

    for (const res of errors) {
      expect(res.body.error).toBeDefined();
      expect(typeof res.body.error!.message).toBe("string");
      expect(res.body.error!.message.length).toBeGreaterThan(0);
    }
  });
});
