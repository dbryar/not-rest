import {
  CreateTodoArgsSchema,
  GetTodoArgsSchema,
  ListTodosArgsSchema,
  UpdateTodoArgsSchema,
  DeleteTodoArgsSchema,
  CompleteTodoArgsSchema,
  ExportTodosArgsSchema,
  GenerateReportArgsSchema,
  SearchTodosArgsSchema,
  SimulateErrorArgsSchema,
  AttachTodoArgsSchema,
  WatchTodosArgsSchema,
  type Todo,
} from "./schemas";
import { createInstance, transitionTo, buildChunks } from "./state";
import { storeMedia, ACCEPTED_MEDIA_TYPES, MAX_MEDIA_BYTES } from "./media";

// WebSocket subscriber management
export interface StreamSession {
  sessionId: string;
  ws?: unknown; // WebSocket reference set by server
}

let streamSessions = new Map<string, StreamSession>();
let broadcastFn: ((event: string, data: Record<string, unknown>) => void) | null = null;

export function registerStreamSession(sessionId: string): StreamSession {
  const session: StreamSession = { sessionId };
  streamSessions.set(sessionId, session);
  return session;
}

export function getStreamSession(sessionId: string): StreamSession | null {
  return streamSessions.get(sessionId) || null;
}

export function setBroadcastFn(fn: (event: string, data: Record<string, unknown>) => void) {
  broadcastFn = fn;
}

function broadcast(event: string, data: Record<string, unknown>) {
  if (broadcastFn) {
    broadcastFn(event, data);
  }
}

export function resetStreamSessions(): void {
  streamSessions = new Map();
  broadcastFn = null;
}

export type HandlerResult =
  | { ok: true; result: unknown }
  | { ok: false; error: { code: string; message: string } };

export type AsyncHandlerResult =
  | { ok: true; async: true; requestId: string }
  | { ok: false; error: { code: string; message: string } };

// In-memory storage
let todos = new Map<string, Todo>();
let idempotencyStore = new Map<string, unknown>();

export function getTodosStore(): Map<string, Todo> {
  return todos;
}

export function resetStorage() {
  todos = new Map();
  idempotencyStore = new Map();
}

export function getIdempotencyStore() {
  return idempotencyStore;
}

function todosCreate(args: unknown): HandlerResult {
  const parsed = CreateTodoArgsSchema.parse(args);
  const now = new Date().toISOString();
  const todo: Todo = {
    id: crypto.randomUUID(),
    title: parsed.title,
    description: parsed.description,
    dueDate: parsed.dueDate,
    labels: parsed.labels,
    completed: false,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  todos.set(todo.id, todo);
  broadcast("created", { event: "created", todo, timestamp: now });
  return { ok: true, result: todo };
}

function todosGet(args: unknown): HandlerResult {
  const { id } = GetTodoArgsSchema.parse(args);
  const todo = todos.get(id);
  if (!todo) {
    return {
      ok: false,
      error: { code: "TODO_NOT_FOUND", message: `Todo with id '${id}' not found` },
    };
  }
  return { ok: true, result: todo };
}

function todosList(args: unknown): HandlerResult {
  const { cursor, limit, completed, label } = ListTodosArgsSchema.parse(args);

  let items = Array.from(todos.values());

  // Apply filters
  if (completed !== undefined) {
    items = items.filter((t) => t.completed === completed);
  }
  if (label !== undefined) {
    items = items.filter((t) => t.labels?.includes(label));
  }

  const total = items.length;

  // Apply cursor pagination
  let startIndex = 0;
  if (cursor) {
    try {
      startIndex = parseInt(atob(cursor), 10);
    } catch {
      startIndex = 0;
    }
  }

  const paged = items.slice(startIndex, startIndex + limit);
  const nextIndex = startIndex + limit;
  const nextCursor = nextIndex < total ? btoa(String(nextIndex)) : null;

  return {
    ok: true,
    result: { items: paged, cursor: nextCursor, total },
  };
}

function todosUpdate(args: unknown): HandlerResult {
  const { id, ...updates } = UpdateTodoArgsSchema.parse(args);
  const todo = todos.get(id);
  if (!todo) {
    return {
      ok: false,
      error: { code: "TODO_NOT_FOUND", message: `Todo with id '${id}' not found` },
    };
  }

  const updated: Todo = {
    ...todo,
    ...Object.fromEntries(Object.entries(updates).filter(([_, v]) => v !== undefined)),
    updatedAt: new Date().toISOString(),
  };
  todos.set(id, updated);
  broadcast("updated", { event: "updated", todo: updated, timestamp: updated.updatedAt });
  return { ok: true, result: updated };
}

function todosDelete(args: unknown): HandlerResult {
  const { id } = DeleteTodoArgsSchema.parse(args);
  const todo = todos.get(id);
  if (!todo) {
    return {
      ok: false,
      error: { code: "TODO_NOT_FOUND", message: `Todo with id '${id}' not found` },
    };
  }
  todos.delete(id);
  broadcast("deleted", { event: "deleted", todoId: id, timestamp: new Date().toISOString() });
  return { ok: true, result: { deleted: true } };
}

function todosComplete(args: unknown): HandlerResult {
  const { id } = CompleteTodoArgsSchema.parse(args);
  const todo = todos.get(id);
  if (!todo) {
    return {
      ok: false,
      error: { code: "TODO_NOT_FOUND", message: `Todo with id '${id}' not found` },
    };
  }

  if (!todo.completed) {
    const now = new Date().toISOString();
    todo.completed = true;
    todo.completedAt = now;
    todo.updatedAt = now;
    todos.set(id, todo);
    broadcast("completed", { event: "completed", todo, timestamp: now });
  }

  return { ok: true, result: todo };
}

function todosExport(args: unknown, requestId: string): AsyncHandlerResult {
  const parsed = ExportTodosArgsSchema.parse(args);
  const instance = createInstance(requestId, "v1:todos.export");

  // Simulate async work
  setTimeout(() => {
    transitionTo(requestId, "pending");
    setTimeout(() => {
      const items = Array.from(todos.values());
      let data: string;
      if (parsed.format === "csv") {
        const header = "id,title,completed,createdAt";
        const rows = items.map((t) => `${t.id},${t.title},${t.completed},${t.createdAt}`);
        data = [header, ...rows].join("\n");
      } else {
        data = JSON.stringify(items);
      }
      const chunks = buildChunks(data);
      transitionTo(requestId, "complete", {
        result: { format: parsed.format, data, count: items.length },
        chunks,
      });
    }, 50);
  }, 50);

  return { ok: true, async: true, requestId: instance.requestId };
}

function reportsGenerate(args: unknown, requestId: string): AsyncHandlerResult {
  const parsed = GenerateReportArgsSchema.parse(args);
  const instance = createInstance(requestId, "v1:reports.generate");

  setTimeout(() => {
    transitionTo(requestId, "pending");
    setTimeout(() => {
      const items = Array.from(todos.values());
      const completedTodos = items.filter((t) => t.completed).length;
      transitionTo(requestId, "complete", {
        result: {
          type: parsed.type,
          totalTodos: items.length,
          completedTodos,
          pendingTodos: items.length - completedTodos,
          generatedAt: new Date().toISOString(),
        },
      });
    }, 50);
  }, 50);

  return { ok: true, async: true, requestId: instance.requestId };
}

function todosWatch(args: unknown): { ok: true; stream: true; sessionId: string } {
  WatchTodosArgsSchema.parse(args);
  const sessionId = crypto.randomUUID();
  registerStreamSession(sessionId);
  return { ok: true, stream: true, sessionId };
}

function todosAttach(args: unknown, mediaFile?: { data: Uint8Array; contentType: string; filename: string }): HandlerResult {
  const parsed = AttachTodoArgsSchema.parse(args);
  const todo = todos.get(parsed.todoId);
  if (!todo) {
    return {
      ok: false,
      error: { code: "TODO_NOT_FOUND", message: `Todo with id '${parsed.todoId}' not found` },
    };
  }

  // Handle ref URI (reference to external media)
  if (parsed.ref) {
    const attachmentId = crypto.randomUUID();
    const media = storeMedia(new Uint8Array(0), "application/octet-stream", parsed.ref);
    todo.attachmentId = media.id;
    todo.location = { uri: `/media/${media.id}` };
    todo.updatedAt = new Date().toISOString();
    todos.set(parsed.todoId, todo);
    return {
      ok: true,
      result: {
        todoId: parsed.todoId,
        attachmentId: media.id,
        contentType: "application/octet-stream",
        filename: parsed.ref,
      },
    };
  }

  // Handle inline multipart upload
  if (!mediaFile) {
    return {
      ok: false,
      error: { code: "MEDIA_REQUIRED", message: "File upload or ref URI is required" },
    };
  }

  // Normalize content type (strip parameters like charset)
  const baseContentType = mediaFile.contentType.split(";")[0].trim();
  if (!ACCEPTED_MEDIA_TYPES.includes(baseContentType)) {
    return {
      ok: false,
      error: {
        code: "UNSUPPORTED_MEDIA_TYPE",
        message: `Unsupported media type: ${baseContentType}. Accepted: ${ACCEPTED_MEDIA_TYPES.join(", ")}`,
      },
    };
  }

  if (mediaFile.data.length > MAX_MEDIA_BYTES) {
    return {
      ok: false,
      error: { code: "MEDIA_TOO_LARGE", message: `File exceeds maximum size of ${MAX_MEDIA_BYTES} bytes` },
    };
  }

  const media = storeMedia(mediaFile.data, baseContentType, mediaFile.filename);
  todo.attachmentId = media.id;
  todo.location = { uri: `/media/${media.id}` };
  todo.updatedAt = new Date().toISOString();
  todos.set(parsed.todoId, todo);

  return {
    ok: true,
    result: {
      todoId: parsed.todoId,
      attachmentId: media.id,
      contentType: mediaFile.contentType,
      filename: mediaFile.filename,
    },
  };
}

export class ServerError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

function todosSearch(args: unknown): HandlerResult {
  // This handler should never be called — the deprecated check in the router
  // should intercept calls to deprecated ops past their sunset date
  const parsed = SearchTodosArgsSchema.parse(args);
  const items = Array.from(todos.values()).filter(
    (t) => t.title.toLowerCase().includes(parsed.query.toLowerCase()),
  );
  return {
    ok: true,
    result: { items: items.slice(0, parsed.limit), cursor: null, total: items.length },
  };
}

function debugSimulateError(args: unknown): HandlerResult {
  const parsed = SimulateErrorArgsSchema.parse(args);
  throw new ServerError(parsed.statusCode, parsed.code, parsed.message);
}

export interface MediaFile {
  data: Uint8Array;
  contentType: string;
  filename: string;
}

export type StreamHandlerResult =
  | { ok: true; stream: true; sessionId: string }
  | { ok: false; error: { code: string; message: string } };

export interface OperationEntry {
  handler: (args: unknown, mediaFile?: MediaFile) => HandlerResult;
  asyncHandler?: (args: unknown, requestId: string) => AsyncHandlerResult;
  streamHandler?: (args: unknown) => StreamHandlerResult;
  sideEffecting: boolean;
  authScopes: string[];
  executionModel: "sync" | "async" | "stream";
  deprecated?: boolean;
  sunset?: string;
  replacement?: string;
  acceptsMedia?: boolean;
}

export const OPERATIONS: Record<string, OperationEntry> = {
  "v1:todos.create": { handler: todosCreate, sideEffecting: true, authScopes: ["todos:write"], executionModel: "sync" },
  "v1:todos.get": { handler: todosGet, sideEffecting: false, authScopes: ["todos:read"], executionModel: "sync" },
  "v1:todos.list": { handler: todosList, sideEffecting: false, authScopes: ["todos:read"], executionModel: "sync" },
  "v1:todos.update": { handler: todosUpdate, sideEffecting: true, authScopes: ["todos:write"], executionModel: "sync" },
  "v1:todos.delete": { handler: todosDelete, sideEffecting: true, authScopes: ["todos:write"], executionModel: "sync" },
  "v1:todos.complete": { handler: todosComplete, sideEffecting: true, authScopes: ["todos:write"], executionModel: "sync" },
  "v1:todos.export": {
    handler: () => { throw new Error("Use asyncHandler"); },
    asyncHandler: todosExport,
    sideEffecting: false,
    authScopes: ["todos:read"],
    executionModel: "async",
  },
  "v1:reports.generate": {
    handler: () => { throw new Error("Use asyncHandler"); },
    asyncHandler: reportsGenerate,
    sideEffecting: false,
    authScopes: ["reports:read"],
    executionModel: "async",
  },
  "v1:todos.search": {
    handler: todosSearch,
    sideEffecting: false,
    authScopes: ["todos:read"],
    executionModel: "sync",
    deprecated: true,
    sunset: "2025-01-01",
    replacement: "v1:todos.list",
  },
  "v1:debug.simulateError": {
    handler: debugSimulateError,
    sideEffecting: false,
    authScopes: [],
    executionModel: "sync",
  },
  "v1:todos.attach": {
    handler: todosAttach,
    sideEffecting: true,
    authScopes: ["todos:write"],
    executionModel: "sync",
    acceptsMedia: true,
  },
  "v1:todos.watch": {
    handler: () => { throw new Error("Use streamHandler"); },
    streamHandler: todosWatch,
    sideEffecting: false,
    authScopes: ["todos:read"],
    executionModel: "stream",
  },
};
