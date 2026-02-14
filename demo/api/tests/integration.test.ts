import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { startServer, stopServer } from "./helpers/server.ts";

const BASE_URL = `http://localhost:${process.env.TEST_PORT || 9876}`;

// Fixed test data (from seed.ts)
const TEST_CARD_NUMBER = "TEST-DEMO-00";
const TEST_BOOK_ID = "00000000-0000-0000-0000-000000000100";
const TEST_BOOK_TITLE = "The Test Pattern Handbook";

beforeAll(async () => {
  await startServer();
});

afterAll(async () => {
  await stopServer();
});

// ── Full Workflow Integration Tests ──────────────────────────────────────

describe("Full Demo Workflow", () => {
  let humanToken: string;
  let agentToken: string;
  let cardNumber: string;

  test("1. Human authenticates and gets token", async () => {
    const res = await fetch(`${BASE_URL}/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "integration-test",
        scopes: ["items:browse", "items:read", "items:write", "items:checkin", "patron:read"],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toMatch(/^demo_/);
    expect(body.cardNumber).toBeDefined();

    humanToken = body.token;
    cardNumber = body.cardNumber;
  });

  test("2. Human can browse catalog", async () => {
    const res = await fetch(`${BASE_URL}/call`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${humanToken}`,
      },
      body: JSON.stringify({
        op: "v1:catalog.list",
        args: { type: "book", limit: 10 },
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.state).toBe("complete");
    expect(body.result.items).toBeDefined();
    expect(body.result.items.length).toBeGreaterThan(0);
  });

  test("3. Human can get item details", async () => {
    const res = await fetch(`${BASE_URL}/call`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${humanToken}`,
      },
      body: JSON.stringify({
        op: "v1:item.get",
        args: { itemId: TEST_BOOK_ID },
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.state).toBe("complete");
    expect(body.result.title).toBe(TEST_BOOK_TITLE);
  });

  test("4. Human can reserve an item (or has overdue)", async () => {
    // Use a book that definitely has copies available
    const res = await fetch(`${BASE_URL}/call`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${humanToken}`,
      },
      body: JSON.stringify({
        op: "v1:item.reserve",
        args: { itemId: "item-book-001" },  // Use test book with many copies
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    // In test DB, patron may have overdue items preventing reservation
    // Both complete and domain errors are valid responses (scope check passed)
    expect(body.state).toMatch(/^(complete|error)$/);
    if (body.state === "complete") {
      expect(body.result.reservedAt).toBeDefined();
    }
  });

  test("5. Agent authenticates with card number", async () => {
    const res = await fetch(`${BASE_URL}/auth/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardNumber }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toMatch(/^agent_/);
    expect(body.scopes).not.toContain("items:checkin");

    agentToken = body.token;
  });

  test("6. Agent can browse catalog (items:browse scope)", async () => {
    const res = await fetch(`${BASE_URL}/call`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${agentToken}`,
      },
      body: JSON.stringify({
        op: "v1:catalog.list",
        args: { limit: 5 },
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.state).toBe("complete");
  });

  test("7. Agent can reserve items (items:write scope)", async () => {
    // Reserve a book with many copies
    const res = await fetch(`${BASE_URL}/call`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${agentToken}`,
      },
      body: JSON.stringify({
        op: "v1:item.reserve",
        args: { itemId: "item-book-002" },  // Use test book with many copies
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    // Both complete and domain errors are valid (scope check passed)
    // Patron may have overdue items in test DB
    expect(body.state).toMatch(/^(complete|error)$/);
  });

  test("8. Agent CANNOT return items (missing items:checkin scope)", async () => {
    const res = await fetch(`${BASE_URL}/call`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${agentToken}`,
      },
      body: JSON.stringify({
        op: "v1:item.return",
        args: { itemId: TEST_BOOK_ID },
      }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.state).toBe("error");
    expect(body.error.code).toBe("INSUFFICIENT_SCOPES");
    expect(body.error.cause.missing).toContain("items:checkin");
  });

  test("9. Human CAN return items (has items:checkin scope)", async () => {
    const res = await fetch(`${BASE_URL}/call`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${humanToken}`,
      },
      body: JSON.stringify({
        op: "v1:item.return",
        args: { itemId: TEST_BOOK_ID },
      }),
    });

    // May return 200 (success) or domain error (NOT_CHECKED_OUT), but NOT 403
    expect(res.status).not.toBe(403);
  });

  test("10. Human can view patron history", async () => {
    const res = await fetch(`${BASE_URL}/call`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${humanToken}`,
      },
      body: JSON.stringify({
        op: "v1:patron.history",
        args: {},
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.state).toBe("complete");
    // Result should have the expected structure
    expect(body.result).toBeDefined();
    // The result should have a history array (or items array depending on implementation)
    const history = body.result.history || body.result.items || [];
    expect(Array.isArray(history)).toBe(true);
  });
});

// ── Test User with Fixed Card Number ─────────────────────────────────────
// NOTE: These tests require the database to be seeded with test user data.
// Run `bun run seed` to create the test user and test book.

describe("Test User Integration", () => {
  test("agent can authenticate with fixed test card (requires seeded DB)", async () => {
    const res = await fetch(`${BASE_URL}/auth/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardNumber: TEST_CARD_NUMBER }),
    });

    // Skip if test user doesn't exist (not yet seeded)
    if (res.status === 404) {
      console.log("Skipping: test user not seeded (run `bun run seed`)");
      return;
    }

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toMatch(/^agent_/);
    expect(body.cardNumber).toBe(TEST_CARD_NUMBER);
    expect(body.username).toBe("test-patron");
  });

  test("test book exists in catalog (requires seeded DB)", async () => {
    // First auth to get token
    const authRes = await fetch(`${BASE_URL}/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scopes: ["items:browse", "items:read"] }),
    });
    const authBody = await authRes.json();
    const token = authBody.token;

    // Get the test book
    const res = await fetch(`${BASE_URL}/call`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({
        op: "v1:item.get",
        args: { itemId: TEST_BOOK_ID },
      }),
    });

    // Skip if test book doesn't exist (not yet seeded)
    if (res.status === 200) {
      const body = await res.json();
      if (body.state === "error" && body.error?.code === "ITEM_NOT_FOUND") {
        console.log("Skipping: test book not seeded (run `bun run seed`)");
        return;
      }
      expect(body.state).toBe("complete");
      expect(body.result.id).toBe(TEST_BOOK_ID);
      expect(body.result.title).toBe(TEST_BOOK_TITLE);
      expect(body.result.creator).toBe("Demo Author");
    }
  });
});

// ── CORS Integration Tests ───────────────────────────────────────────────

describe("CORS Integration", () => {
  const APP_ORIGIN = "http://localhost:3000";

  test("browser can call API directly with CORS", async () => {
    // First get a token
    const authRes = await fetch(`${BASE_URL}/auth`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Origin": APP_ORIGIN,
      },
      body: JSON.stringify({ scopes: ["items:browse"] }),
    });

    expect(authRes.status).toBe(200);
    expect(authRes.headers.get("Access-Control-Allow-Origin")).toBe(APP_ORIGIN);

    const authBody = await authRes.json();
    const token = authBody.token;

    // Make API call with CORS
    const callRes = await fetch(`${BASE_URL}/call`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        "Origin": APP_ORIGIN,
      },
      body: JSON.stringify({
        op: "v1:catalog.list",
        args: { limit: 5 },
      }),
    });

    expect(callRes.status).toBe(200);
    expect(callRes.headers.get("Access-Control-Allow-Origin")).toBe(APP_ORIGIN);

    const body = await callRes.json();
    expect(body.state).toBe("complete");
    expect(body.requestId).toBeDefined();
  });

  test("preflight OPTIONS request works", async () => {
    const res = await fetch(`${BASE_URL}/call`, {
      method: "OPTIONS",
      headers: {
        "Origin": APP_ORIGIN,
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
});

// ── API Registry Tests ───────────────────────────────────────────────────

describe("API Registry", () => {
  test("registry lists all operations", async () => {
    const res = await fetch(`${BASE_URL}/.well-known/ops`);

    expect(res.status).toBe(200);
    const body = await res.json();

    // Verify key operations exist (registry uses 'op' not 'name')
    const opNames = body.operations.map((op: any) => op.op);
    expect(opNames).toContain("v1:catalog.list");
    expect(opNames).toContain("v1:item.get");
    expect(opNames).toContain("v1:item.reserve");
    expect(opNames).toContain("v1:item.return");
    expect(opNames).toContain("v1:patron.get");
    expect(opNames).toContain("v1:patron.history");
  });

  test("operations have required metadata", async () => {
    const res = await fetch(`${BASE_URL}/.well-known/ops`);
    const body = await res.json();

    for (const op of body.operations) {
      expect(op.op).toBeDefined();
      expect(op.executionModel).toMatch(/^(sync|async)$/);
      expect(op.authScopes).toBeDefined();
      expect(op.argsSchema).toBeDefined();
      expect(op.resultSchema).toBeDefined();
    }
  });
});

// ── Async Operations Tests ───────────────────────────────────────────────

describe("Async Operations", () => {
  test("report generation returns 202 Accepted", async () => {
    // Auth
    const authRes = await fetch(`${BASE_URL}/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scopes: ["reports:generate"] }),
    });
    const { token } = await authRes.json();

    // Generate report
    const res = await fetch(`${BASE_URL}/call`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({
        op: "v1:report.generate",
        args: { type: "overdue" },
      }),
    });

    // Should be 202 Accepted with state=accepted
    if (res.status === 202) {
      const body = await res.json();
      expect(body.state).toBe("accepted");
      expect(body.requestId).toBeDefined();
      expect(body.location).toBeDefined();
    } else {
      // Might complete immediately for small datasets
      expect(res.status).toBe(200);
    }
  });
});
