import { describe, expect, test } from "bun:test";
import { getRegistry } from "./helpers/client";
import { callWithAuth, callWithoutAuth, generateToken, registerToken } from "./helpers/auth";
import { validTodo } from "./helpers/fixtures";

describe("Auth (REQ-AUTH)", () => {
  test("write operation without Authorization header returns 401", async () => {
    const { status, body } = await callWithoutAuth("v1:todos.create", validTodo());
    expect(status).toBe(401);
    expect(body.state).toBe("error");
    expect(body.error!.code).toBe("AUTH_REQUIRED");
  });

  test("operation with invalid bearer token returns 401", async () => {
    const { status, body } = await callWithAuth("v1:todos.create", validTodo(), {}, "invalid-token-xyz");
    expect(status).toBe(401);
    expect(body.state).toBe("error");
  });

  test("write operation with read-only token returns 403", async () => {
    const readOnlyToken = generateToken("read-only");
    await registerToken(readOnlyToken, ["todos:read"]);
    const { status, body } = await callWithAuth("v1:todos.create", validTodo(), {}, readOnlyToken);
    expect(status).toBe(403);
    expect(body.error!.code).toBe("INSUFFICIENT_SCOPE");
  });

  test("write operation with valid write token returns 200 complete", async () => {
    const writeToken = generateToken("writer");
    await registerToken(writeToken, ["todos:write"]);
    const { status, body } = await callWithAuth("v1:todos.create", validTodo(), {}, writeToken);
    expect(status).toBe(200);
    expect(body.state).toBe("complete");
  });

  test("read operation with valid read token returns 200", async () => {
    // First create a todo with the master token
    const { body: created } = await callWithAuth("v1:todos.create", validTodo());
    const todoId = (created.result as { id: string }).id;

    const readToken = generateToken("reader");
    await registerToken(readToken, ["todos:read"]);
    const { status, body } = await callWithAuth("v1:todos.get", { id: todoId }, {}, readToken);
    expect(status).toBe(200);
    expect(body.state).toBe("complete");
  });

  test("read operation without Authorization header returns 401", async () => {
    const { status, body } = await callWithoutAuth("v1:todos.list");
    expect(status).toBe(401);
    expect(body.state).toBe("error");
  });

  test("401 response contains state=error with code and message", async () => {
    const { status, body } = await callWithoutAuth("v1:todos.create", validTodo());
    expect(status).toBe(401);
    expect(body.state).toBe("error");
    expect(body.error).toBeDefined();
    expect(body.error!.code).toBeTruthy();
    expect(body.error!.message).toBeTruthy();
  });

  test("403 response contains state=error with code and message", async () => {
    const readOnlyToken = generateToken("read-only-2");
    await registerToken(readOnlyToken, ["todos:read"]);
    const { status, body } = await callWithAuth("v1:todos.delete", { id: "any" }, {}, readOnlyToken);
    expect(status).toBe(403);
    expect(body.state).toBe("error");
    expect(body.error).toBeDefined();
    expect(body.error!.code).toBeTruthy();
    expect(body.error!.message).toBeTruthy();
  });

  test("write operations in registry declare todos:write authScope", async () => {
    const { body } = await getRegistry();
    const writeOps = ["v1:todos.create", "v1:todos.update", "v1:todos.delete", "v1:todos.complete"];
    for (const opName of writeOps) {
      const op = body.operations.find((o) => o.op === opName);
      expect(op).toBeDefined();
      expect(op!.authScopes).toContain("todos:write");
    }
  });

  test("read operations in registry declare todos:read authScope", async () => {
    const { body } = await getRegistry();
    const readOps = ["v1:todos.get", "v1:todos.list"];
    for (const opName of readOps) {
      const op = body.operations.find((o) => o.op === opName);
      expect(op).toBeDefined();
      expect(op!.authScopes).toContain("todos:read");
    }
  });
});
