import { zodToJsonSchema } from "zod-to-json-schema";
import {
  CreateTodoArgsSchema,
  GetTodoArgsSchema,
  ListTodosArgsSchema,
  UpdateTodoArgsSchema,
  DeleteTodoArgsSchema,
  CompleteTodoArgsSchema,
  ExportTodosArgsSchema,
  ExportTodosResultSchema,
  GenerateReportArgsSchema,
  GenerateReportResultSchema,
  SearchTodosArgsSchema,
  SimulateErrorArgsSchema,
  SimulateErrorResultSchema,
  AttachTodoArgsSchema,
  AttachTodoResultSchema,
  WatchTodosArgsSchema,
  WatchTodosFrameSchema,
  TodoSchema,
  ListTodosResultSchema,
  DeleteTodoResultSchema,
} from "./schemas";

function toJsonSchema(zodSchema: Parameters<typeof zodToJsonSchema>[0]) {
  const schema = zodToJsonSchema(zodSchema) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
}

export interface RegistryOperation {
  op: string;
  description: string;
  argsSchema: Record<string, unknown>;
  resultSchema: Record<string, unknown>;
  sideEffecting: boolean;
  idempotencyRequired: boolean;
  executionModel: string;
  authScopes: string[];
  deprecated?: boolean;
  sunset?: string;
  replacement?: string;
  mediaSchema?: Record<string, unknown>;
  supportedTransports?: string[];
  supportedEncodings?: string[];
  frameSchema?: Record<string, unknown>;
  ttlSeconds?: number;
}

export interface Registry {
  callVersion: string;
  operations: RegistryOperation[];
}

export function buildRegistry(): Registry {
  return {
    callVersion: "2026-02-10",
    operations: [
      {
        op: "v1:todos.create",
        description: "Create a new todo item",
        argsSchema: toJsonSchema(CreateTodoArgsSchema),
        resultSchema: toJsonSchema(TodoSchema),
        sideEffecting: true,
        idempotencyRequired: true,
        executionModel: "sync",
        authScopes: ["todos:write"],
      },
      {
        op: "v1:todos.get",
        description: "Get a todo item by ID",
        argsSchema: toJsonSchema(GetTodoArgsSchema),
        resultSchema: toJsonSchema(TodoSchema),
        sideEffecting: false,
        idempotencyRequired: false,
        executionModel: "sync",
        authScopes: ["todos:read"],
      },
      {
        op: "v1:todos.list",
        description: "List todo items with optional filters and pagination",
        argsSchema: toJsonSchema(ListTodosArgsSchema),
        resultSchema: toJsonSchema(ListTodosResultSchema),
        sideEffecting: false,
        idempotencyRequired: false,
        executionModel: "sync",
        authScopes: ["todos:read"],
      },
      {
        op: "v1:todos.update",
        description: "Update a todo item",
        argsSchema: toJsonSchema(UpdateTodoArgsSchema),
        resultSchema: toJsonSchema(TodoSchema),
        sideEffecting: true,
        idempotencyRequired: true,
        executionModel: "sync",
        authScopes: ["todos:write"],
      },
      {
        op: "v1:todos.delete",
        description: "Delete a todo item",
        argsSchema: toJsonSchema(DeleteTodoArgsSchema),
        resultSchema: toJsonSchema(DeleteTodoResultSchema),
        sideEffecting: true,
        idempotencyRequired: true,
        executionModel: "sync",
        authScopes: ["todos:write"],
      },
      {
        op: "v1:todos.complete",
        description: "Mark a todo item as complete",
        argsSchema: toJsonSchema(CompleteTodoArgsSchema),
        resultSchema: toJsonSchema(TodoSchema),
        sideEffecting: true,
        idempotencyRequired: true,
        executionModel: "sync",
        authScopes: ["todos:write"],
      },
      {
        op: "v1:todos.export",
        description: "Export all todos in CSV or JSON format",
        argsSchema: toJsonSchema(ExportTodosArgsSchema),
        resultSchema: toJsonSchema(ExportTodosResultSchema),
        sideEffecting: false,
        idempotencyRequired: false,
        executionModel: "async",
        authScopes: ["todos:read"],
      },
      {
        op: "v1:reports.generate",
        description: "Generate a summary report of todos",
        argsSchema: toJsonSchema(GenerateReportArgsSchema),
        resultSchema: toJsonSchema(GenerateReportResultSchema),
        sideEffecting: false,
        idempotencyRequired: false,
        executionModel: "async",
        authScopes: ["reports:read"],
      },
      {
        op: "v1:todos.search",
        description: "Search todos by query (deprecated, use v1:todos.list with label filter)",
        argsSchema: toJsonSchema(SearchTodosArgsSchema),
        resultSchema: toJsonSchema(ListTodosResultSchema),
        sideEffecting: false,
        idempotencyRequired: false,
        executionModel: "sync",
        authScopes: ["todos:read"],
        deprecated: true,
        sunset: "2025-01-01",
        replacement: "v1:todos.list",
      },
      {
        op: "v1:debug.simulateError",
        description: "Simulate a server error for testing (test-only)",
        argsSchema: toJsonSchema(SimulateErrorArgsSchema),
        resultSchema: toJsonSchema(SimulateErrorResultSchema),
        sideEffecting: false,
        idempotencyRequired: false,
        executionModel: "sync",
        authScopes: [],
      },
      {
        op: "v1:todos.watch",
        description: "Watch for changes to todo items via WebSocket stream",
        argsSchema: toJsonSchema(WatchTodosArgsSchema),
        resultSchema: toJsonSchema(WatchTodosFrameSchema),
        sideEffecting: false,
        idempotencyRequired: false,
        executionModel: "stream",
        authScopes: ["todos:read"],
        supportedTransports: ["wss"],
        supportedEncodings: ["json"],
        frameSchema: toJsonSchema(WatchTodosFrameSchema),
        ttlSeconds: 3600,
      },
      {
        op: "v1:todos.attach",
        description: "Attach a file to a todo item",
        argsSchema: toJsonSchema(AttachTodoArgsSchema),
        resultSchema: toJsonSchema(AttachTodoResultSchema),
        sideEffecting: true,
        idempotencyRequired: true,
        executionModel: "sync",
        authScopes: ["todos:write"],
        mediaSchema: {
          name: "file",
          required: false,
          acceptedTypes: ["image/png", "image/jpeg", "application/pdf", "text/plain"],
          maxBytes: 10485760,
        },
      },
    ],
  };
}
