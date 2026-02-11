let counter = 0;

export function validTodo(overrides: Record<string, unknown> = {}) {
  counter++;
  return {
    title: `Test Todo ${counter} ${Date.now()}`,
    description: "A test todo item",
    dueDate: "2026-12-31",
    labels: ["test", "example"],
    ...overrides,
  };
}

export function minimalTodo(overrides: Record<string, unknown> = {}) {
  counter++;
  return {
    title: `Minimal Todo ${counter} ${Date.now()}`,
    ...overrides,
  };
}
