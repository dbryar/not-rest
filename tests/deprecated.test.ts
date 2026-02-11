import { describe, expect, test } from "bun:test";
import { call, getRegistry } from "./helpers/client";
import { validTodo } from "./helpers/fixtures";

describe("Deprecated Operations (REQ-DEPR)", () => {
  test("registry marks v1:todos.search as deprecated", async () => {
    const { body } = await getRegistry();
    const search = body.operations.find((o) => o.op === "v1:todos.search");
    expect(search).toBeDefined();
    expect(search!.deprecated).toBe(true);
  });

  test("deprecated operation has sunset date in YYYY-MM-DD format", async () => {
    const { body } = await getRegistry();
    const search = body.operations.find((o) => o.op === "v1:todos.search");
    expect(search).toBeDefined();
    expect(search!.sunset).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("deprecated operation has replacement pointing to v1:todos.list", async () => {
    const { body } = await getRegistry();
    const search = body.operations.find((o) => o.op === "v1:todos.search");
    expect(search).toBeDefined();
    expect(search!.replacement).toBe("v1:todos.list");
  });

  test("deprecated op past sunset date returns HTTP 410", async () => {
    const { status } = await call("v1:todos.search", { query: "test" });
    expect(status).toBe(410);
  });

  test("410 response has state=error with code OP_REMOVED", async () => {
    const { body } = await call("v1:todos.search", { query: "test" });
    expect(body.state).toBe("error");
    expect(body.error!.code).toBe("OP_REMOVED");
  });

  test("410 response error.cause includes removedOp and replacement", async () => {
    const { body } = await call("v1:todos.search", { query: "test" });
    const cause = body.error!.cause;
    expect(cause).toBeDefined();
    expect(cause!.removedOp).toBe("v1:todos.search");
    expect(cause!.replacement).toBe("v1:todos.list");
  });

  test("replacement operation v1:todos.list with label filter returns matching results", async () => {
    await call("v1:todos.create", validTodo({ labels: ["searchable"] }));
    const { status, body } = await call("v1:todos.list", { label: "searchable" });
    expect(status).toBe(200);
    expect(body.state).toBe("complete");
    const result = body.result as { items: unknown[]; total: number };
    expect(result.total).toBeGreaterThan(0);
  });
});
