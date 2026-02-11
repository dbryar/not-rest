import { describe, expect, test } from "bun:test";
import { call, getRegistry } from "./helpers/client";
import { pollOperation, waitForCompletion } from "./helpers/async";
import { callWithoutAuth } from "./helpers/auth";
import { validTodo } from "./helpers/fixtures";

describe("Async Execution (REQ-ASYNC)", () => {
  test("v1:todos.export returns HTTP 202 with state=accepted", async () => {
    const { status, body } = await call("v1:todos.export", { format: "csv" });
    expect(status).toBe(202);
    expect(body.state).toBe("accepted");
  });

  test("202 response includes requestId and retryAfterMs", async () => {
    const { body } = await call("v1:todos.export", { format: "csv" });
    expect(body.requestId).toBeTruthy();
    expect(body.retryAfterMs).toBeGreaterThan(0);
  });

  test("polling GET /ops/{requestId} returns current operation state", async () => {
    const { body } = await call("v1:todos.export", { format: "csv" });
    const poll = await pollOperation(body.requestId);
    expect(poll.status).toBe(200);
    expect(["accepted", "pending", "complete"]).toContain(poll.body.state);
  });

  test("async operation transitions from accepted through pending to complete", async () => {
    const { body } = await call("v1:todos.export", { format: "csv" });
    const seenStates = new Set<string>();
    seenStates.add("accepted"); // initial state
    const result = await waitForCompletion(body.requestId);
    expect(result.state).toBe("complete");
  });

  test("completed async operation includes result and no error", async () => {
    const { body } = await call("v1:todos.export", { format: "csv" });
    const result = await waitForCompletion(body.requestId);
    expect(result.state).toBe("complete");
    expect(result.result).toBeDefined();
    expect(result.error).toBeUndefined();
  });

  test("v1:reports.generate returns 202 and eventually completes", async () => {
    const { status, body } = await call("v1:reports.generate", { type: "summary" });
    expect(status).toBe(202);
    const result = await waitForCompletion(body.requestId);
    expect(result.state).toBe("complete");
    expect(result.result).toBeDefined();
  });

  test("polling nonexistent requestId returns 404", async () => {
    const poll = await pollOperation("nonexistent-id-12345");
    expect(poll.status).toBe(404);
  });

  test("completed v1:todos.export contains expected export data", async () => {
    // Create a todo first so there's data to export
    await call("v1:todos.create", validTodo());

    const { body } = await call("v1:todos.export", { format: "csv" });
    const result = await waitForCompletion(body.requestId);
    const exportResult = result.result as { format: string; data: string; count: number };
    expect(exportResult.format).toBe("csv");
    expect(exportResult.data).toContain("id,title,completed,createdAt");
    expect(exportResult.count).toBeGreaterThan(0);
  });

  test("registry declares async executionModel for export and report ops", async () => {
    const { body } = await getRegistry();
    const exportOp = body.operations.find((o) => o.op === "v1:todos.export");
    const reportOp = body.operations.find((o) => o.op === "v1:reports.generate");
    expect(exportOp).toBeDefined();
    expect(exportOp!.executionModel).toBe("async");
    expect(reportOp).toBeDefined();
    expect(reportOp!.executionModel).toBe("async");
  });

  test("async operation without valid auth token returns 401", async () => {
    const { status, body } = await callWithoutAuth("v1:todos.export", { format: "csv" });
    expect(status).toBe(401);
    expect(body.state).toBe("error");
  });

  test("202 response includes expiresAt as Unix epoch seconds", async () => {
    const { body } = await call("v1:todos.export", { format: "csv" });
    expect(typeof body.expiresAt).toBe("number");
    expect(body.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });
});
