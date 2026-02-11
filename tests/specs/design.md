# Design Document: OpenCALL Todo Example API

## Overview

This design covers a reference todo list API implementing the OpenCALL specification, along with a language-agnostic test suite. The API demonstrates the core OpenCALL patterns: self-description via `GET /.well-known/ops`, operation invocation via `POST /call`, and proper error classification.

### Current State

- The OpenCALL specification exists as a document (`specification.md`)
- No working implementations exist
- No test suites exist to validate conformance

### Design Goals

1. Prove the OpenCALL spec works with a real, running API
2. Create a language-agnostic test suite usable against any implementation
3. Use Zod as a single source of truth for validation and JSON Schema generation
4. Enable in-process testing for fast TDD cycles
5. Support Docker-based testing for language-agnostic validation

### Key Design Decisions

1. **Single entry point**: `POST /call` dispatches by `op` name. `GET /.well-known/ops` serves the registry. No other routes.
2. **Schema strategy**: Zod defines schemas once. Runtime validation via `.parse()`. JSON Schema for the registry via `zod-to-json-schema`. Single source of truth.
3. **In-memory storage**: `Map<string, Todo>` with no persistence. Tests are self-contained — each creates its own data, no reset endpoint needed.
4. **Error classification**: ZodError maps to HTTP 400 `VALIDATION_ERROR`. Domain errors (handler returns `ok: false`) map to HTTP 200 `state=error`. Unknown op maps to HTTP 400 `UNKNOWN_OP`. Internal errors map to HTTP 500.
5. **Idempotency**: In-memory `Map<string, response>` keyed by idempotency key. Side-effecting ops check before execution.
6. **Pagination**: Cursor-based with opaque base64-encoded index tokens.

## Architecture

### Component Interaction Flow

```
Client (test suite)
  │
  ├─ GET /.well-known/ops ──► Registry (static JSON, cached with ETag)
  │
  └─ POST /call ──► Router
                      ├─ Parse envelope { op, args, ctx }
                      ├─ Validate op exists
                      ├─ Check idempotency store
                      ├─ Validate args via Zod .parse()
                      ├─ Execute handler
                      └─ Return response envelope
```

### Data Flow

```
Request { op, args, ctx }
  │
  ▼
Router
  ├─ op missing? ──► 400 INVALID_REQUEST
  ├─ op unknown? ──► 400 UNKNOWN_OP
  ├─ idempotency hit? ──► Return cached response
  ├─ args invalid? ──► 400 VALIDATION_ERROR (ZodError)
  ├─ handler error? ──► 200 state=error (domain error)
  ├─ handler success? ──► 200 state=complete
  └─ unexpected error? ──► 500 INTERNAL_ERROR
```

## Components and Interfaces

### 1. Schemas (`schemas.ts`)

**Purpose**: Single source of truth for all operation argument/result shapes.

**File**: `tests/api/typescript/src/schemas.ts`

Exports Zod schemas:
- `TodoSchema` — full todo object (id, title, description, dueDate, labels, completed, completedAt, createdAt, updatedAt)
- `CreateTodoArgsSchema` — title required, description/dueDate/labels optional
- `GetTodoArgsSchema` — id required
- `ListTodosArgsSchema` — cursor, limit (default 20), completed, label — all optional
- `UpdateTodoArgsSchema` — id required, title/description/dueDate/labels/completed optional
- `DeleteTodoArgsSchema` — id required
- `CompleteTodoArgsSchema` — id required
- `ListTodosResultSchema` — `{ items: Todo[], cursor: string | null, total: number }`
- `DeleteTodoResultSchema` — `{ deleted: boolean }`

### 2. Operations (`operations.ts`)

**Purpose**: Business logic handlers with in-memory storage.

**File**: `tests/api/typescript/src/operations.ts`

- In-memory `Map<string, Todo>` for todos
- In-memory `Map<string, response>` for idempotency
- Handler functions return `{ ok: true, result }` or `{ ok: false, error: { code, message } }`
- `resetStorage()` export for clean server starts
- `OPERATIONS` registry mapping op names to `{ handler, sideEffecting }`

### 3. Registry (`registry.ts`)

**Purpose**: Builds the `/.well-known/ops` response from Zod schemas.

**File**: `tests/api/typescript/src/registry.ts`

- Uses `zodToJsonSchema()` for each Zod schema
- Strips `$schema` key from embedded schemas
- Builds full registry: `{ callVersion: "2026-02-10", operations: [...] }`

### 4. Router (`router.ts`)

**Purpose**: Parses the request envelope, dispatches to handlers, classifies errors.

**File**: `tests/api/typescript/src/router.ts`

- Validates `op` is present and is a string
- Looks up handler in `OPERATIONS`
- Checks idempotency store for side-effecting ops
- Catches `ZodError` → `VALIDATION_ERROR` (HTTP 400)
- Domain errors → HTTP 200 `state=error`
- Stores response for idempotency if key provided

### 5. Server Entry Point (`index.ts`)

**Purpose**: HTTP server with `createServer()` factory for in-process testing.

**File**: `tests/api/typescript/src/index.ts`

- `createServer(port)` — calls `resetStorage()`, returns `Bun.serve()`
- Routes: `GET /.well-known/ops`, `POST /call`, 404 for all else
- `ETag` + `Cache-Control` on registry, `304 Not Modified` for conditional requests
- Exports `createServer` for test lifecycle

## Testing Strategy

### Test Helpers

- `client.ts` — `call(op, args, ctx?)` and `getRegistry()` using `fetch()`. Uses `API_URL` env var.
- `fixtures.ts` — `validTodo(overrides?)` and `minimalTodo(overrides?)` factories
- `server.ts` — `startServer()` / `stopServer()` wrapping the API's `createServer()`
- `setup.ts` — Preloaded by bunfig. Starts/stops server if `API_URL` is not set.

### Test Files

| File | Requirement | Approx Tests |
|------|------------|-------------|
| `self-description.test.ts` | REQ-SELF | ~9 |
| `envelope.test.ts` | REQ-ENV | ~6 |
| `crud.test.ts` | REQ-CRUD | ~15 |
| `errors.test.ts` | REQ-ERR | ~7 |
| `idempotency.test.ts` | REQ-IDEM | ~4 |

### In-Process vs Docker Testing

- Default: In-process via `createServer()` import, preloaded lifecycle
- Docker: Set `API_URL=http://localhost:3000` to test against a running container
- Same tests, same assertions — only the transport changes
