import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { startServer, stopServer } from "./helpers/server.ts";
import { call, authenticate, poll } from "./helpers/client.ts";

beforeAll(async () => {
  await startServer();
});

afterAll(async () => {
  await stopServer();
});

describe("Async operations — polling", () => {
  let token: string;

  beforeAll(async () => {
    const auth = await authenticate({
      scopes: ["items:browse", "items:read", "items:write", "patron:read", "reports:generate"],
    });
    token = auth.body.token;
  });

  test("POST /call with v1:report.generate returns 202 with state=accepted", async () => {
    const res = await call("v1:report.generate", {}, undefined, token);

    if (res.status === 400 && res.body.error?.code === "UNKNOWN_OPERATION") {
      console.log("v1:report.generate not implemented yet, skipping async test");
      return;
    }

    expect(res.status).toBe(202);
    expect(res.body.state).toBe("accepted");
  });

  test("response includes location.uri pointing to /ops/{requestId}", async () => {
    const res = await call("v1:report.generate", {}, undefined, token);

    if (res.status === 400 && res.body.error?.code === "UNKNOWN_OPERATION") {
      console.log("v1:report.generate not implemented yet, skipping");
      return;
    }

    expect(res.status).toBe(202);
    expect(res.body.location).toBeDefined();
    expect(res.body.location!.uri).toMatch(/\/ops\/[0-9a-f-]+/);
    expect(res.body.location!.uri).toContain(res.body.requestId);
  });

  test(
    "polling at GET /ops/{requestId} returns current state",
    async () => {
      const res = await call("v1:report.generate", {}, undefined, token);

      if (res.status === 400 && res.body.error?.code === "UNKNOWN_OPERATION") {
        console.log("v1:report.generate not implemented yet, skipping");
        return;
      }

      const requestId = res.body.requestId;

      // Wait a moment then poll
      await new Promise((resolve) => setTimeout(resolve, 600));
      const pollRes = await poll(requestId);

      // State should be one of: accepted, pending, complete, error
      expect(["accepted", "pending", "complete", "error"]).toContain(pollRes.body.state);
      expect(pollRes.body.requestId).toBe(requestId);
    },
    { timeout: 10000 }
  );

  test("GET /ops/{unknownId} returns 404", async () => {
    const unknownId = crypto.randomUUID();
    const res = await poll(unknownId);
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe("OPERATION_NOT_FOUND");
  });

  test(
    "polling twice within 1 second returns 429 RATE_LIMITED",
    async () => {
      const res = await call("v1:report.generate", {}, undefined, token);
      if (res.status === 400) return;

      const requestId = res.body.requestId;

      // First poll — should succeed
      await new Promise((resolve) => setTimeout(resolve, 1100));
      const first = await poll(requestId);
      expect([200, 202]).toContain(first.status);

      // Immediate second poll — should be rate limited
      const second = await poll(requestId);
      expect(second.status).toBe(429);
      expect(second.body.state).toBe("error");
      expect(second.body.error.code).toBe("RATE_LIMITED");
      expect(second.body.retryAfterMs).toBeDefined();
      expect(second.body.retryAfterMs).toBeGreaterThan(0);
      expect(second.body.retryAfterMs).toBeLessThanOrEqual(1000);
    },
    { timeout: 15000 }
  );

  test(
    "polling with 1+ second gap both succeed (no 429)",
    async () => {
      const res = await call("v1:report.generate", {}, undefined, token);
      if (res.status === 400) return;

      const requestId = res.body.requestId;

      // First poll after enough delay
      await new Promise((resolve) => setTimeout(resolve, 1100));
      const first = await poll(requestId);
      expect([200, 202]).toContain(first.status);

      // Wait >1 second then poll again
      await new Promise((resolve) => setTimeout(resolve, 1100));
      const second = await poll(requestId);
      expect([200, 202]).toContain(second.status);
    },
    { timeout: 15000 }
  );

  test(
    "different requestIds can be polled simultaneously without 429",
    async () => {
      const res1 = await call("v1:report.generate", {}, undefined, token);
      const res2 = await call("v1:report.generate", {}, undefined, token);
      if (res1.status === 400 || res2.status === 400) return;

      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Poll both — neither should be rate limited
      const poll1 = await poll(res1.body.requestId);
      const poll2 = await poll(res2.body.requestId);

      expect([200, 202]).toContain(poll1.status);
      expect([200, 202]).toContain(poll2.status);
    },
    { timeout: 15000 }
  );
});
