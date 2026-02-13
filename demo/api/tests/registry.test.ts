import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { startServer, stopServer } from "./helpers/server.ts";
import { getRegistry } from "./helpers/client.ts";

const BASE_URL = `http://localhost:${process.env.TEST_PORT || 9876}`;

beforeAll(async () => {
  await startServer();
});

afterAll(async () => {
  await stopServer();
});

describe("GET /.well-known/ops", () => {
  test("returns 200 with Content-Type: application/json", async () => {
    const res = await getRegistry();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/json");
  });

  test("response body includes callVersion as '2026-02-10'", async () => {
    const res = await getRegistry();
    expect(res.body.callVersion).toBe("2026-02-10");
  });

  test("operations array contains at least 9 entries", async () => {
    const res = await getRegistry();
    const ops = res.body.operations as unknown[];
    expect(Array.isArray(ops)).toBe(true);
    expect(ops.length).toBeGreaterThanOrEqual(9);
  });

  test("all sync operation names are present", async () => {
    const res = await getRegistry();
    const ops = res.body.operations as Array<{ op: string }>;
    const opNames = ops.map((o) => o.op);

    const expectedSync = [
      "v1:catalog.list",
      "v1:catalog.listLegacy",
      "v1:item.get",
      "v1:item.getMedia",
      "v1:item.reserve",
      "v1:item.return",
      "v1:patron.get",
      "v1:patron.history",
      "v1:patron.fines",
    ];

    for (const expected of expectedSync) {
      expect(opNames).toContain(expected);
    }
  });

  test("each entry has required fields", async () => {
    const res = await getRegistry();
    const ops = res.body.operations as Array<Record<string, unknown>>;

    const requiredFields = [
      "op",
      "argsSchema",
      "resultSchema",
      "sideEffecting",
      "idempotencyRequired",
      "executionModel",
      "maxSyncMs",
      "ttlSeconds",
      "authScopes",
      "cachingPolicy",
    ];

    for (const entry of ops) {
      for (const field of requiredFields) {
        expect(entry).toHaveProperty(field);
      }
    }
  });

  test("argsSchema and resultSchema have $schema or type property (valid JSON Schema)", async () => {
    const res = await getRegistry();
    const ops = res.body.operations as Array<{
      op: string;
      argsSchema: Record<string, unknown>;
      resultSchema: Record<string, unknown>;
    }>;

    for (const entry of ops) {
      const argsHasSchema = "$schema" in entry.argsSchema || "type" in entry.argsSchema;
      expect(argsHasSchema).toBe(true);

      const resultHasSchema = "$schema" in entry.resultSchema || "type" in entry.resultSchema;
      expect(resultHasSchema).toBe(true);
    }
  });

  test("v1:catalog.listLegacy has deprecated: true, sunset, and replacement", async () => {
    const res = await getRegistry();
    const ops = res.body.operations as Array<{
      op: string;
      deprecated?: boolean;
      sunset?: string;
      replacement?: string;
    }>;

    const legacy = ops.find((o) => o.op === "v1:catalog.listLegacy");
    expect(legacy).toBeDefined();
    expect(legacy!.deprecated).toBe(true);
    expect(legacy!.sunset).toBe("2026-06-01");
    expect(legacy!.replacement).toBe("v1:catalog.list");
  });

  test("response includes ETag and Cache-Control headers", async () => {
    const res = await getRegistry();
    expect(res.headers.get("ETag")).toBeDefined();
    expect(res.headers.get("ETag")).not.toBe("");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=3600");
  });

  test("conditional request with matching If-None-Match returns 304", async () => {
    // First, get the ETag
    const firstRes = await getRegistry();
    const etag = firstRes.headers.get("ETag")!;
    expect(etag).toBeDefined();

    // Second request with If-None-Match
    const res = await fetch(`${BASE_URL}/.well-known/ops`, {
      headers: { "If-None-Match": etag },
    });

    expect(res.status).toBe(304);
  });
});
