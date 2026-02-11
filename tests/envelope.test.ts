import { describe, expect, test } from "bun:test";
import { call } from "./helpers/client";
import { minimalTodo } from "./helpers/fixtures";

describe("Response Envelope (REQ-ENV)", () => {
  test("requestId is echoed from request ctx", async () => {
    const requestId = crypto.randomUUID();
    const { body } = await call("v1:todos.create", minimalTodo(), { requestId });
    expect(body.requestId).toBe(requestId);
  });

  test("requestId is always present even if not provided", async () => {
    const { body } = await call("v1:todos.create", minimalTodo());
    expect(body.requestId).toBeDefined();
    expect(typeof body.requestId).toBe("string");
    expect(body.requestId.length).toBeGreaterThan(0);
  });

  test("sessionId is echoed when provided", async () => {
    const sessionId = crypto.randomUUID();
    const { body } = await call("v1:todos.create", minimalTodo(), { sessionId });
    expect(body.sessionId).toBe(sessionId);
  });

  test("state=complete has result and no error", async () => {
    const { body } = await call("v1:todos.create", minimalTodo());
    expect(body.state).toBe("complete");
    expect(body.result).toBeDefined();
    expect(body.error).toBeUndefined();
  });

  test("state=error has error and no result", async () => {
    const { body } = await call("v1:todos.get", { id: "nonexistent-id" });
    expect(body.state).toBe("error");
    expect(body.error).toBeDefined();
    expect(body.error!.code).toBeDefined();
    expect(body.error!.message).toBeDefined();
    expect(body.result).toBeUndefined();
  });

  test("result and error are mutually exclusive", async () => {
    // Success case
    const success = await call("v1:todos.create", minimalTodo());
    expect(success.body.result).toBeDefined();
    expect(success.body.error).toBeUndefined();

    // Error case
    const error = await call("v1:todos.get", { id: "nonexistent-id" });
    expect(error.body.error).toBeDefined();
    expect(error.body.result).toBeUndefined();
  });
});
