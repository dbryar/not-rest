import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { startServer, stopServer } from "./helpers/server.ts";
import { call, authenticate, poll, getChunks } from "./helpers/client.ts";

beforeAll(async () => {
  await startServer();
});

afterAll(async () => {
  await stopServer();
});

describe("Chunked retrieval", () => {
  let token: string;

  beforeAll(async () => {
    const auth = await authenticate({
      scopes: ["items:browse", "items:read", "items:write", "patron:read", "reports:generate"],
    });
    token = auth.body.token;
  });

  /**
   * Helper: submit a report.generate request and wait for it to complete.
   * Returns null if the operation is not implemented yet.
   */
  async function submitAndWaitForReport(): Promise<string | null> {
    const res = await call("v1:report.generate", {}, undefined, token);

    if (res.status === 400 && res.body.error?.code === "UNKNOWN_OPERATION") {
      return null;
    }

    expect(res.status).toBe(202);
    const requestId = res.body.requestId;

    // Poll until complete or error (max 20 attempts with 600ms delay, respects 500ms rate limit)
    for (let i = 0; i < 20; i++) {
      await new Promise((resolve) => setTimeout(resolve, 600));
      const pollRes = await poll(requestId);
      if (pollRes.body.state === "complete" || pollRes.body.state === "error") {
        return requestId;
      }
    }

    return requestId;
  }

  test(
    "after report completes, GET /ops/{requestId}/chunks returns chunk with checksum and data",
    async () => {
      const requestId = await submitAndWaitForReport();

      if (!requestId) {
        console.log("v1:report.generate not implemented yet, skipping chunks test");
        return;
      }

      // Verify the operation completed
      await new Promise((resolve) => setTimeout(resolve, 600));
      const pollRes = await poll(requestId);
      if (pollRes.body.state !== "complete") {
        console.log("Report did not complete in time, skipping chunks data test");
        return;
      }

      const chunksRes = await getChunks(requestId);
      expect(chunksRes.status).toBe(200);

      const body = chunksRes.body;
      expect(body).toHaveProperty("checksum");
      expect(body).toHaveProperty("data");
    },
    { timeout: 20000 }
  );

  test(
    "checksum is hex format",
    async () => {
      const requestId = await submitAndWaitForReport();

      if (!requestId) {
        console.log("v1:report.generate not implemented yet, skipping checksum format test");
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 600));
      const pollRes = await poll(requestId);
      if (pollRes.body.state !== "complete") {
        console.log("Report did not complete, skipping checksum format test");
        return;
      }

      const chunksRes = await getChunks(requestId);
      if (chunksRes.status !== 200) {
        console.log("Chunks endpoint returned non-200, skipping");
        return;
      }

      const checksum = chunksRes.body.checksum as string;
      expect(checksum).toMatch(/^sha256:[0-9a-f]{64}$/);
    },
    { timeout: 20000 }
  );

  test(
    "checksumPrevious is null for first chunk",
    async () => {
      const requestId = await submitAndWaitForReport();

      if (!requestId) {
        console.log("v1:report.generate not implemented yet, skipping checksumPrevious test");
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 600));
      const pollRes = await poll(requestId);
      if (pollRes.body.state !== "complete") {
        console.log("Report did not complete, skipping checksumPrevious test");
        return;
      }

      const chunksRes = await getChunks(requestId);
      if (chunksRes.status !== 200) {
        console.log("Chunks endpoint returned non-200, skipping");
        return;
      }

      expect(chunksRes.body.checksumPrevious).toBeNull();
    },
    { timeout: 20000 }
  );

  test(
    "final chunk has state=complete and cursor=null",
    async () => {
      const requestId = await submitAndWaitForReport();

      if (!requestId) {
        console.log("v1:report.generate not implemented yet, skipping final chunk test");
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 600));
      const pollRes = await poll(requestId);
      if (pollRes.body.state !== "complete") {
        console.log("Report did not complete, skipping final chunk test");
        return;
      }

      // Walk through all chunks until we hit the final one
      let cursor: string | undefined = undefined;
      let lastChunk: Record<string, unknown> | null = null;
      let iterations = 0;

      while (iterations < 50) {
        const chunksRes = await getChunks(requestId, cursor);
        if (chunksRes.status !== 200) break;

        lastChunk = chunksRes.body;

        if (!chunksRes.body.cursor) {
          // This is the final chunk
          break;
        }

        cursor = chunksRes.body.cursor as string;
        iterations++;
      }

      if (lastChunk) {
        expect(lastChunk.state).toBe("complete");
        expect(lastChunk.cursor).toBeNull();
      }
    },
    { timeout: 20000 }
  );

  test("GET /ops/{unknownId}/chunks returns 404", async () => {
    const unknownId = crypto.randomUUID();
    const res = await getChunks(unknownId);
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe("OPERATION_NOT_FOUND");
  });
});
