import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { startServer, stopServer } from "./helpers/server.ts";
import { authenticate, authenticateAgent, call, getRaw } from "./helpers/client.ts";

const BASE_URL = `http://localhost:${process.env.TEST_PORT || 9876}`;

beforeAll(async () => {
  await startServer();
});

afterAll(async () => {
  await stopServer();
});

// ── POST /auth — Human auth ────────────────────────────────────────────

describe("POST /auth", () => {
  test("returns { token, username, cardNumber, scopes, expiresAt }", async () => {
    const res = await authenticate();
    expect(res.status).toBe(200);

    const body = res.body;
    expect(body).toHaveProperty("token");
    expect(body).toHaveProperty("username");
    expect(body).toHaveProperty("cardNumber");
    expect(body).toHaveProperty("scopes");
    expect(body).toHaveProperty("expiresAt");
  });

  test("token starts with 'demo_'", async () => {
    const res = await authenticate();
    expect(res.body.token).toMatch(/^demo_/);
  });

  test("generated username follows adjective-animal format when not provided", async () => {
    const res = await authenticate();
    expect(res.body.username).toMatch(/^[a-z]+-[a-z]+$/);
  });

  test("strips items:manage and patron:billing from requested scopes", async () => {
    const res = await authenticate({
      scopes: ["items:browse", "items:read", "items:manage", "patron:billing", "patron:read"],
    });
    expect(res.status).toBe(200);

    const scopes = res.body.scopes as string[];
    expect(scopes).toContain("items:browse");
    expect(scopes).toContain("items:read");
    expect(scopes).toContain("patron:read");
    expect(scopes).not.toContain("items:manage");
    expect(scopes).not.toContain("patron:billing");
  });
});

// ── POST /auth/agent — Agent auth ──────────────────────────────────────

describe("POST /auth/agent", () => {
  let seedCardNumber: string;

  beforeAll(async () => {
    // Create a patron via human auth to get a valid card number
    const human = await authenticate();
    seedCardNumber = human.body.cardNumber as string;
  });

  test("with a valid patron card number returns { token, username, patronId, cardNumber, scopes, expiresAt }", async () => {
    const res = await authenticateAgent(seedCardNumber);
    expect(res.status).toBe(200);

    const body = res.body;
    expect(body).toHaveProperty("token");
    expect(body).toHaveProperty("username");
    expect(body).toHaveProperty("patronId");
    expect(body).toHaveProperty("cardNumber");
    expect(body).toHaveProperty("scopes");
    expect(body).toHaveProperty("expiresAt");
    expect(body.cardNumber).toBe(seedCardNumber);
  });

  test("agent token starts with 'agent_'", async () => {
    const res = await authenticateAgent(seedCardNumber);
    expect(res.body.token).toMatch(/^agent_/);
  });

  test("agent token carries fixed scopes", async () => {
    const res = await authenticateAgent(seedCardNumber);
    const scopes = res.body.scopes as string[];
    expect(scopes).toEqual(["items:browse", "items:read", "items:write", "patron:read"]);
  });

  test("with invalid card format returns 400 INVALID_CARD", async () => {
    const res = await authenticateAgent("bad-format");
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe("INVALID_CARD");
  });

  test("with unknown card returns 404 PATRON_NOT_FOUND", async () => {
    const res = await authenticateAgent("AbCd-EfGh-Ij");
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe("PATRON_NOT_FOUND");
  });
});

// ── Auth enforcement on /call ───────────────────────────────────────────

describe("Auth enforcement", () => {
  test("missing Authorization header on POST /call returns 401 AUTH_REQUIRED", async () => {
    // Call without token
    const res = await call("v1:catalog.list", {});
    expect(res.status).toBe(401);
    expect(res.body.state).toBe("error");
    expect(res.body.error!.code).toBe("AUTH_REQUIRED");
  });

  test("scope enforcement: v1:patron.fines returns 403 INSUFFICIENT_SCOPES with patron:billing in cause", async () => {
    // Default human token does not include patron:billing
    const auth = await authenticate();
    const token = auth.body.token;

    const res = await call("v1:patron.fines", {}, undefined, token);
    expect(res.status).toBe(403);
    expect(res.body.state).toBe("error");
    expect(res.body.error!.code).toBe("INSUFFICIENT_SCOPES");

    const cause = res.body.error!.cause as { missing: string[] };
    expect(cause.missing).toContain("patron:billing");
  });
});
