import { describe, expect, test } from "bun:test";
import { call } from "./helpers/client";
import { minimalTodo } from "./helpers/fixtures";

describe("Idempotency (REQ-IDEM)", () => {
  test("same idempotency key returns same result without duplicate", async () => {
    const idempotencyKey = `idem-${Date.now()}-${Math.random()}`;
    const args = minimalTodo();

    const first = await call("v1:todos.create", args, { idempotencyKey });
    const second = await call("v1:todos.create", args, { idempotencyKey });

    expect(first.body.state).toBe("complete");
    expect(second.body.state).toBe("complete");

    const firstTodo = first.body.result as Record<string, unknown>;
    const secondTodo = second.body.result as Record<string, unknown>;
    expect(firstTodo.id).toBe(secondTodo.id);

    // Verify the todo exists (not duplicated) by fetching it directly
    const getResult = await call("v1:todos.get", { id: firstTodo.id });
    expect(getResult.body.state).toBe("complete");
  });

  test("different idempotency keys create different todos", async () => {
    const args = minimalTodo();
    const first = await call("v1:todos.create", args, {
      idempotencyKey: `key-a-${Date.now()}`,
    });
    const second = await call("v1:todos.create", args, {
      idempotencyKey: `key-b-${Date.now()}`,
    });

    const firstTodo = first.body.result as Record<string, unknown>;
    const secondTodo = second.body.result as Record<string, unknown>;
    expect(firstTodo.id).not.toBe(secondTodo.id);
  });

  test("no idempotency key allows duplicates", async () => {
    const args = minimalTodo();
    const first = await call("v1:todos.create", args);
    const second = await call("v1:todos.create", args);

    const firstTodo = first.body.result as Record<string, unknown>;
    const secondTodo = second.body.result as Record<string, unknown>;
    expect(firstTodo.id).not.toBe(secondTodo.id);
  });

  test("non-side-effecting operations ignore idempotency key", async () => {
    const createResult = await call("v1:todos.create", minimalTodo());
    const todo = createResult.body.result as Record<string, unknown>;

    const idempotencyKey = `list-idem-${Date.now()}`;
    const first = await call("v1:todos.list", {}, { idempotencyKey });
    expect(first.body.state).toBe("complete");

    // Create another todo and list again with same key — should see new state
    await call("v1:todos.create", minimalTodo());
    const second = await call("v1:todos.list", {}, { idempotencyKey });
    expect(second.body.state).toBe("complete");

    const firstTotal = (first.body.result as { total: number }).total;
    const secondTotal = (second.body.result as { total: number }).total;
    expect(secondTotal).toBeGreaterThan(firstTotal);
  });
});
