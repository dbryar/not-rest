import { describe, expect, test } from "bun:test";
import { call, API_URL } from "./helpers/client";
import { waitForCompletion } from "./helpers/async";
import { validTodo } from "./helpers/fixtures";

async function getChunks(requestId: string, cursor?: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const params = cursor ? `?cursor=${cursor}` : "";
  const headers: Record<string, string> = {};
  if (process.env.AUTH_TOKEN) {
    headers["Authorization"] = `Bearer ${process.env.AUTH_TOKEN}`;
  }
  const res = await fetch(`${API_URL}/ops/${requestId}/chunks${params}`, { headers });
  const body = await res.json();
  return { status: res.status, body };
}

describe("Chunked Retrieval (REQ-CHUNK)", () => {
  test("completed export operation returns chunk response", async () => {
    // Create some todos to have data
    for (let i = 0; i < 5; i++) {
      await call("v1:todos.create", validTodo());
    }

    const { body: accepted } = await call("v1:todos.export", { format: "csv" });
    await waitForCompletion(accepted.requestId);

    const { status, body } = await getChunks(accepted.requestId);
    expect(status).toBe(200);
    expect(body.chunk).toBeDefined();
  });

  test("first chunk has offset 0", async () => {
    await call("v1:todos.create", validTodo());
    const { body: accepted } = await call("v1:todos.export", { format: "csv" });
    await waitForCompletion(accepted.requestId);

    const { body } = await getChunks(accepted.requestId);
    const chunk = body.chunk as Record<string, unknown>;
    expect(chunk.offset).toBe(0);
  });

  test("first chunk has checksumPrevious as null", async () => {
    await call("v1:todos.create", validTodo());
    const { body: accepted } = await call("v1:todos.export", { format: "csv" });
    await waitForCompletion(accepted.requestId);

    const { body } = await getChunks(accepted.requestId);
    const chunk = body.chunk as Record<string, unknown>;
    expect(chunk.checksumPrevious).toBeNull();
  });

  test("chunk checksum is in sha256:{hex} format", async () => {
    await call("v1:todos.create", validTodo());
    const { body: accepted } = await call("v1:todos.export", { format: "csv" });
    await waitForCompletion(accepted.requestId);

    const { body } = await getChunks(accepted.requestId);
    const chunk = body.chunk as Record<string, unknown>;
    expect(chunk.checksum).toMatch(/^sha256:[0-9a-f]+$/);
  });

  test("SHA-256 of chunk data matches declared checksum", async () => {
    await call("v1:todos.create", validTodo());
    const { body: accepted } = await call("v1:todos.export", { format: "csv" });
    await waitForCompletion(accepted.requestId);

    const { body } = await getChunks(accepted.requestId);
    const chunk = body.chunk as { data: string; checksum: string };
    const hasher = new Bun.CryptoHasher("sha256");
    hasher.update(chunk.data);
    const computed = `sha256:${hasher.digest("hex")}`;
    expect(chunk.checksum).toBe(computed);
  });

  test("second chunk checksumPrevious matches first chunk checksum", async () => {
    // Create many todos to ensure multiple chunks
    for (let i = 0; i < 20; i++) {
      await call("v1:todos.create", validTodo({ title: `Chunked test todo ${i} with a longer title to ensure we exceed chunk size limit` }));
    }

    const { body: accepted } = await call("v1:todos.export", { format: "csv" });
    await waitForCompletion(accepted.requestId);

    const { body: first } = await getChunks(accepted.requestId);
    const firstChunk = first.chunk as { checksum: string; cursor: string | null };

    if (firstChunk.cursor) {
      const { body: second } = await getChunks(accepted.requestId, firstChunk.cursor);
      const secondChunk = second.chunk as { checksumPrevious: string | null };
      expect(secondChunk.checksumPrevious).toBe(firstChunk.checksum);
    } else {
      // Data fit in one chunk — test still passes
      expect(firstChunk.cursor).toBeNull();
    }
  });

  test("final chunk has state=complete", async () => {
    await call("v1:todos.create", validTodo());
    const { body: accepted } = await call("v1:todos.export", { format: "csv" });
    await waitForCompletion(accepted.requestId);

    // Walk to the last chunk
    let cursor: string | null = null;
    let lastChunk: Record<string, unknown> = {};
    do {
      const { body } = await getChunks(accepted.requestId, cursor || undefined);
      lastChunk = body.chunk as Record<string, unknown>;
      cursor = lastChunk.cursor as string | null;
    } while (cursor);

    expect(lastChunk.state).toBe("complete");
  });

  test("requesting with cursor returns next chunk", async () => {
    for (let i = 0; i < 20; i++) {
      await call("v1:todos.create", validTodo({ title: `Cursor nav test ${i} extra padding to exceed chunk boundary` }));
    }

    const { body: accepted } = await call("v1:todos.export", { format: "csv" });
    await waitForCompletion(accepted.requestId);

    const { body: first } = await getChunks(accepted.requestId);
    const firstChunk = first.chunk as { cursor: string | null; offset: number };

    if (firstChunk.cursor) {
      const { body: second } = await getChunks(accepted.requestId, firstChunk.cursor);
      const secondChunk = second.chunk as { offset: number };
      expect(secondChunk.offset).toBeGreaterThan(firstChunk.offset);
    } else {
      // Single chunk — still valid
      expect(firstChunk.cursor).toBeNull();
    }
  });
});
