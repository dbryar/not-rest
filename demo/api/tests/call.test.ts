import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { startServer, stopServer } from "./helpers/server.ts";
import { call, authenticate } from "./helpers/client.ts";

beforeAll(async () => {
  await startServer();
});

afterAll(async () => {
  await stopServer();
});

// ── Envelope format ─────────────────────────────────────────────────────

describe("Envelope format", () => {
  let token: string;

  beforeAll(async () => {
    const auth = await authenticate();
    token = auth.body.token;
  });

  test("POST /call returns envelope with requestId in UUID format", async () => {
    const res = await call("v1:catalog.list", {}, undefined, token);
    expect(res.status).toBe(200);
    expect(res.body.requestId).toBeDefined();
    expect(res.body.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  test("echoes ctx.requestId when provided", async () => {
    const requestId = crypto.randomUUID();
    const res = await call("v1:catalog.list", {}, { requestId }, token);
    expect(res.status).toBe(200);
    expect(res.body.requestId).toBe(requestId);
  });

  test("echoes ctx.sessionId when provided", async () => {
    const requestId = crypto.randomUUID();
    const sessionId = crypto.randomUUID();
    const res = await call("v1:catalog.list", {}, { requestId, sessionId }, token);
    expect(res.status).toBe(200);
    expect(res.body.sessionId).toBe(sessionId);
  });
});

// ── catalog.list ────────────────────────────────────────────────────────

describe("v1:catalog.list", () => {
  let token: string;

  beforeAll(async () => {
    const auth = await authenticate();
    token = auth.body.token;
  });

  test("returns state=complete with items array of correct shape", async () => {
    const res = await call("v1:catalog.list", {}, undefined, token);
    expect(res.status).toBe(200);
    expect(res.body.state).toBe("complete");
    expect(res.body.result).toBeDefined();

    const result = res.body.result as {
      items: Array<Record<string, unknown>>;
      total: number;
      limit: number;
      offset: number;
    };

    expect(Array.isArray(result.items)).toBe(true);
    expect(result.items.length).toBeGreaterThan(0);

    const item = result.items[0]!;
    expect(item).toHaveProperty("id");
    expect(item).toHaveProperty("type");
    expect(item).toHaveProperty("title");
    expect(item).toHaveProperty("creator");
    expect(item).toHaveProperty("year");
    expect(item).toHaveProperty("available");
    expect(item).toHaveProperty("availableCopies");
    expect(item).toHaveProperty("totalCopies");
  });

  test("respects type filter", async () => {
    const res = await call("v1:catalog.list", { type: "cd" }, undefined, token);
    expect(res.status).toBe(200);
    const result = res.body.result as { items: Array<{ type: string }> };
    expect(result.items.length).toBeGreaterThan(0);
    for (const item of result.items) {
      expect(item.type).toBe("cd");
    }
  });

  test("respects search filter", async () => {
    // First get an item to know a title to search for
    const listRes = await call("v1:catalog.list", { limit: 1 }, undefined, token);
    const firstItem = (listRes.body.result as { items: Array<{ title: string }> }).items[0]!;
    const searchTerm = firstItem.title.split(" ")[0]!;

    const res = await call("v1:catalog.list", { search: searchTerm }, undefined, token);
    expect(res.status).toBe(200);
    const result = res.body.result as { items: Array<{ title: string; creator: string }> };
    // Each item should have title or creator matching search term
    for (const item of result.items) {
      const titleMatch = item.title.toLowerCase().includes(searchTerm.toLowerCase());
      const creatorMatch = item.creator.toLowerCase().includes(searchTerm.toLowerCase());
      expect(titleMatch || creatorMatch).toBe(true);
    }
  });

  test("respects available filter", async () => {
    const res = await call("v1:catalog.list", { available: true }, undefined, token);
    expect(res.status).toBe(200);
    const result = res.body.result as { items: Array<{ available: boolean }> };
    for (const item of result.items) {
      expect(item.available).toBe(true);
    }
  });

  test("respects limit/offset pagination", async () => {
    const page1 = await call("v1:catalog.list", { limit: 3, offset: 0 }, undefined, token);
    const page2 = await call("v1:catalog.list", { limit: 3, offset: 3 }, undefined, token);

    const result1 = page1.body.result as { items: Array<{ id: string }> };
    const result2 = page2.body.result as { items: Array<{ id: string }> };

    expect(result1.items.length).toBe(3);
    expect(result2.items.length).toBe(3);

    // Items on page 2 should differ from page 1
    const ids1 = new Set(result1.items.map((i) => i.id));
    for (const item of result2.items) {
      expect(ids1.has(item.id)).toBe(false);
    }
  });

  test("returns total count", async () => {
    const res = await call("v1:catalog.list", { limit: 5 }, undefined, token);
    const result = res.body.result as { items: unknown[]; total: number };
    expect(typeof result.total).toBe("number");
    expect(result.total).toBeGreaterThan(0);
    // total should be >= items returned (total reflects all matching, not just this page)
    expect(result.total).toBeGreaterThanOrEqual(result.items.length);
  });
});

// ── catalog.listLegacy ──────────────────────────────────────────────────

describe("v1:catalog.listLegacy", () => {
  let token: string;

  beforeAll(async () => {
    const auth = await authenticate();
    token = auth.body.token;
  });

  test("returns same shape as catalog.list", async () => {
    const res = await call("v1:catalog.listLegacy", {}, undefined, token);
    expect(res.status).toBe(200);
    expect(res.body.state).toBe("complete");

    const result = res.body.result as {
      items: Array<Record<string, unknown>>;
      total: number;
      limit: number;
      offset: number;
    };

    expect(Array.isArray(result.items)).toBe(true);
    expect(result.items.length).toBeGreaterThan(0);
    expect(typeof result.total).toBe("number");
    expect(typeof result.limit).toBe("number");
    expect(typeof result.offset).toBe("number");

    const item = result.items[0]!;
    expect(item).toHaveProperty("id");
    expect(item).toHaveProperty("type");
    expect(item).toHaveProperty("title");
    expect(item).toHaveProperty("creator");
    expect(item).toHaveProperty("year");
    expect(item).toHaveProperty("available");
    expect(item).toHaveProperty("availableCopies");
    expect(item).toHaveProperty("totalCopies");
  });

  test("delegates to same service (results match catalog.list)", async () => {
    const legacy = await call("v1:catalog.listLegacy", { limit: 5 }, undefined, token);
    const modern = await call("v1:catalog.list", { limit: 5 }, undefined, token);

    const legacyResult = legacy.body.result as { items: Array<{ id: string }>; total: number };
    const modernResult = modern.body.result as { items: Array<{ id: string }>; total: number };

    expect(legacyResult.total).toBe(modernResult.total);
    expect(legacyResult.items.map((i) => i.id)).toEqual(modernResult.items.map((i) => i.id));
  });
});

// ── item.get ────────────────────────────────────────────────────────────

describe("v1:item.get", () => {
  let token: string;
  let validItemId: string;

  beforeAll(async () => {
    const auth = await authenticate();
    token = auth.body.token;

    // Get a valid item ID from the catalog
    const list = await call("v1:catalog.list", { limit: 1 }, undefined, token);
    const result = list.body.result as { items: Array<{ id: string }> };
    validItemId = result.items[0]!.id;
  });

  test("returns full item record for valid itemId", async () => {
    const res = await call("v1:item.get", { itemId: validItemId }, undefined, token);
    expect(res.status).toBe(200);
    expect(res.body.state).toBe("complete");

    const item = res.body.result as Record<string, unknown>;
    expect(item.id).toBe(validItemId);
    expect(item).toHaveProperty("type");
    expect(item).toHaveProperty("title");
    expect(item).toHaveProperty("creator");
    expect(item).toHaveProperty("year");
    expect(item).toHaveProperty("isbn");
    expect(item).toHaveProperty("description");
    expect(item).toHaveProperty("coverImageKey");
    expect(item).toHaveProperty("tags");
    expect(item).toHaveProperty("available");
    expect(item).toHaveProperty("totalCopies");
    expect(item).toHaveProperty("availableCopies");
    expect(Array.isArray(item.tags)).toBe(true);
  });

  test("returns domain error ITEM_NOT_FOUND for nonexistent itemId", async () => {
    const res = await call("v1:item.get", { itemId: "nonexistent-id" }, undefined, token);
    expect(res.status).toBe(200);
    expect(res.body.state).toBe("error");
    expect(res.body.error).toBeDefined();
    expect(res.body.error!.code).toBe("ITEM_NOT_FOUND");
  });
});

// ── item.getMedia ───────────────────────────────────────────────────────

describe("v1:item.getMedia", () => {
  let token: string;
  let validItemId: string;

  beforeAll(async () => {
    const auth = await authenticate();
    token = auth.body.token;

    const list = await call("v1:catalog.list", { limit: 1 }, undefined, token);
    const result = list.body.result as { items: Array<{ id: string }> };
    validItemId = result.items[0]!.id;
  });

  test("returns 303 or 200 depending on coverImageKey", async () => {
    const res = await call("v1:item.getMedia", { itemId: validItemId }, undefined, token);
    // Items without coverImageKey return 200 with placeholder result
    // Items with coverImageKey return 303 with location
    expect([200, 303]).toContain(res.status);

    if (res.status === 200) {
      expect(res.body.state).toBe("complete");
      expect(res.body.result).toBeDefined();
      const result = res.body.result as { placeholder: boolean; url: string };
      expect(result.placeholder).toBe(true);
      expect(result.url).toContain("placeholder");
    } else {
      expect(res.body.state).toBe("complete");
      expect(res.body.location).toBeDefined();
      expect(res.body.location!.uri).toContain("storage.googleapis.com");
    }
  });

  test("returns ITEM_NOT_FOUND for nonexistent itemId", async () => {
    const res = await call("v1:item.getMedia", { itemId: "nonexistent-id" }, undefined, token);
    expect(res.status).toBe(200);
    expect(res.body.state).toBe("error");
    expect(res.body.error!.code).toBe("ITEM_NOT_FOUND");
  });
});

// ── item.return ─────────────────────────────────────────────────────────

describe("v1:item.return", () => {
  let token: string;
  let patronOverdueItemId: string;
  let validItemId: string;

  beforeAll(async () => {
    const auth = await authenticate();
    token = auth.body.token;

    // Get the patron's overdue items to find one to return
    const patronRes = await call("v1:patron.get", {}, undefined, token);
    const patronResult = patronRes.body.result as {
      overdueItems: Array<{ itemId: string }>;
    };
    expect(patronResult.overdueItems.length).toBeGreaterThanOrEqual(2);
    patronOverdueItemId = patronResult.overdueItems[0]!.itemId;

    // Get a valid but non-checked-out item
    const list = await call("v1:catalog.list", { available: true, limit: 50 }, undefined, token);
    const items = (list.body.result as { items: Array<{ id: string }> }).items;
    const overdueIds = new Set(patronResult.overdueItems.map((i) => i.itemId));
    const nonCheckedOut = items.find((i) => !overdueIds.has(i.id));
    validItemId = nonCheckedOut ? nonCheckedOut.id : items[0]!.id;
  });

  test("successful return for overdue item includes wasOverdue/daysLate/message", async () => {
    const res = await call("v1:item.return", { itemId: patronOverdueItemId }, undefined, token);
    expect(res.status).toBe(200);
    expect(res.body.state).toBe("complete");

    const result = res.body.result as {
      itemId: string;
      title: string;
      returnedAt: string;
      wasOverdue: boolean;
      daysLate: number;
      message: string;
    };

    expect(result.itemId).toBe(patronOverdueItemId);
    expect(result.wasOverdue).toBe(true);
    expect(result.daysLate).toBeGreaterThan(0);
    expect(typeof result.message).toBe("string");
    expect(result.message.length).toBeGreaterThan(0);
    expect(typeof result.returnedAt).toBe("string");
    expect(typeof result.title).toBe("string");
  });

  test("returns ITEM_NOT_FOUND for nonexistent itemId", async () => {
    const res = await call("v1:item.return", { itemId: "nonexistent-id" }, undefined, token);
    expect(res.status).toBe(200);
    expect(res.body.state).toBe("error");
    expect(res.body.error!.code).toBe("ITEM_NOT_FOUND");
  });

  test("returns ITEM_NOT_CHECKED_OUT when not checked out by this patron", async () => {
    const res = await call("v1:item.return", { itemId: validItemId }, undefined, token);
    expect(res.status).toBe(200);
    expect(res.body.state).toBe("error");
    expect(res.body.error!.code).toBe("ITEM_NOT_CHECKED_OUT");
  });
});

// ── item.reserve ────────────────────────────────────────────────────────

describe("v1:item.reserve", () => {
  let token: string;

  beforeAll(async () => {
    const auth = await authenticate();
    token = auth.body.token;
  });

  test("returns OVERDUE_ITEMS_EXIST when patron has overdue items", async () => {
    // Get an available item to try reserving
    const list = await call("v1:catalog.list", { available: true, limit: 1 }, undefined, token);
    const items = (list.body.result as { items: Array<{ id: string }> }).items;
    const itemId = items[0]!.id;

    const res = await call("v1:item.reserve", { itemId }, undefined, token);
    expect(res.status).toBe(200);
    expect(res.body.state).toBe("error");
    expect(res.body.error!.code).toBe("OVERDUE_ITEMS_EXIST");

    // cause should include count and hint
    const cause = res.body.error!.cause as { count: number; hint: string };
    expect(typeof cause.count).toBe("number");
    expect(cause.count).toBeGreaterThanOrEqual(2);
    expect(typeof cause.hint).toBe("string");
    expect(cause.hint).toContain("v1:patron.get");
  });
});

// ── patron.get ──────────────────────────────────────────────────────────

describe("v1:patron.get", () => {
  let token: string;

  beforeAll(async () => {
    const auth = await authenticate();
    token = auth.body.token;
  });

  test("returns patron data with overdueItems array", async () => {
    const res = await call("v1:patron.get", {}, undefined, token);
    expect(res.status).toBe(200);
    expect(res.body.state).toBe("complete");

    const result = res.body.result as {
      patronId: string;
      patronName: string;
      cardNumber: string;
      overdueItems: Array<{
        lendingId: string;
        itemId: string;
        title: string;
        creator: string;
        checkoutDate: string;
        dueDate: string;
        daysLate: number;
      }>;
      totalOverdue: number;
      activeReservations: number;
      totalCheckedOut: number;
    };

    expect(typeof result.patronId).toBe("string");
    expect(typeof result.patronName).toBe("string");
    expect(typeof result.cardNumber).toBe("string");
    expect(Array.isArray(result.overdueItems)).toBe(true);
    expect(typeof result.totalOverdue).toBe("number");
    expect(typeof result.activeReservations).toBe("number");
    expect(typeof result.totalCheckedOut).toBe("number");
  });

  test("newly created patron has at least 2 overdue items", async () => {
    const res = await call("v1:patron.get", {}, undefined, token);
    const result = res.body.result as {
      overdueItems: unknown[];
      totalOverdue: number;
    };

    expect(result.overdueItems.length).toBeGreaterThanOrEqual(2);
    expect(result.totalOverdue).toBeGreaterThanOrEqual(2);

    // Validate shape of each overdue item
    for (const item of result.overdueItems as Array<Record<string, unknown>>) {
      expect(typeof item.lendingId).toBe("string");
      expect(typeof item.itemId).toBe("string");
      expect(typeof item.title).toBe("string");
      expect(typeof item.creator).toBe("string");
      expect(typeof item.checkoutDate).toBe("string");
      expect(typeof item.dueDate).toBe("string");
      expect(typeof item.daysLate).toBe("number");
      expect(item.daysLate as number).toBeGreaterThan(0);
    }
  });
});

// ── patron.history ──────────────────────────────────────────────────────

describe("v1:patron.history", () => {
  let token: string;

  beforeAll(async () => {
    const auth = await authenticate();
    token = auth.body.token;
  });

  test("returns paginated records with patronId, records, total, limit, offset", async () => {
    const res = await call("v1:patron.history", {}, undefined, token);
    expect(res.status).toBe(200);
    expect(res.body.state).toBe("complete");

    const result = res.body.result as {
      patronId: string;
      records: Array<Record<string, unknown>>;
      total: number;
      limit: number;
      offset: number;
    };

    expect(typeof result.patronId).toBe("string");
    expect(Array.isArray(result.records)).toBe(true);
    expect(typeof result.total).toBe("number");
    expect(typeof result.limit).toBe("number");
    expect(typeof result.offset).toBe("number");
    expect(result.total).toBeGreaterThanOrEqual(result.records.length);

    // Newly created patrons have overdue items, so there should be records
    expect(result.records.length).toBeGreaterThan(0);

    const record = result.records[0]!;
    expect(typeof record.lendingId).toBe("string");
    expect(typeof record.itemId).toBe("string");
    expect(typeof record.title).toBe("string");
    expect(typeof record.creator).toBe("string");
    expect(typeof record.checkoutDate).toBe("string");
    expect(typeof record.dueDate).toBe("string");
    // returnDate can be null or string
    expect(record.returnDate === null || typeof record.returnDate === "string").toBe(true);
    expect(typeof record.daysLate).toBe("number");
  });

  test("respects limit and offset parameters", async () => {
    const page1 = await call("v1:patron.history", { limit: 1, offset: 0 }, undefined, token);
    const page2 = await call("v1:patron.history", { limit: 1, offset: 1 }, undefined, token);

    const result1 = page1.body.result as { records: Array<{ lendingId: string }> };
    const result2 = page2.body.result as { records: Array<{ lendingId: string }> };

    expect(result1.records.length).toBe(1);
    // If total > 1 there should be a second page
    if (result2.records.length > 0) {
      expect(result1.records[0]!.lendingId).not.toBe(result2.records[0]!.lendingId);
    }
  });
});
