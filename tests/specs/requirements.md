# Requirements Document

## Introduction

- **Context**: The OpenCALL specification defines a self-describing, operation-based API protocol. The repo contains only spec documents.
- **Current State**: No working examples exist to prove the spec works.
- **Problem Statement**: We need concrete, working example APIs with a language-agnostic test suite that validates any implementation against the OpenCALL contract.
- **Scope**: A todo list API implemented in TypeScript and Python, tested by a language-agnostic HTTP test suite. Covers auth, async execution, streaming, media handling, chunked retrieval, deprecated operations, and schema evolution.
- **Dependencies**: OpenCALL specification (`specification.md`)

## Glossary

- **Operation**: A named action invoked via `POST /call` with a versioned name like `v1:todos.create`
- **Registry**: The self-description endpoint at `GET /.well-known/ops` listing all operations and their schemas
- **Envelope**: The canonical request/response JSON wrapper (`{ op, args, ctx }` / `{ requestId, state, result|error }`)
- **Domain Error**: A business logic error returned as HTTP 200 with `state=error` (not HTTP 4xx)
- **Protocol Error**: A malformed request or unknown operation returned as HTTP 400
- **Idempotency Key**: A client-supplied key in `ctx.idempotencyKey` that prevents duplicate side effects

## Requirements

### Requirement 1: Self-Description (REQ-SELF)

**User Story:** As an API consumer, I want to discover all available operations and their schemas from a single endpoint, so that I can understand the API contract without external documentation.

#### Acceptance Criteria

1. WHEN a client sends `GET /.well-known/ops`, THE server SHALL return HTTP 200 with `Content-Type: application/json`
2. THE response SHALL include `callVersion` as a `YYYY-MM-DD` date string and `operations` as an array
3. EACH operation in the registry SHALL include: `op`, `argsSchema`, `resultSchema`, `sideEffecting`, `executionModel`
4. WHEN an operation is side-effecting, THE registry entry SHALL declare `idempotencyRequired: true`
5. THE `argsSchema` and `resultSchema` SHALL be valid JSON Schema objects with `type: "object"` and `properties`
6. THE registry SHALL include all six todo operations: `v1:todos.create`, `v1:todos.get`, `v1:todos.list`, `v1:todos.update`, `v1:todos.delete`, `v1:todos.complete`
7. THE `v1:todos.create` `argsSchema` SHALL list `title` in its `required` array
8. CRUD operations SHALL declare `executionModel: "sync"`, async operations SHALL declare `"async"`, and streaming operations SHALL declare `"stream"`
9. THE response SHOULD include `Cache-Control` and `ETag` headers

### Requirement 2: Response Envelope (REQ-ENV)

**User Story:** As an API consumer, I want every response to follow a consistent envelope format, so that I can handle all operations uniformly.

#### Acceptance Criteria

1. EVERY `POST /call` response SHALL include `requestId` (string) and `state` (`complete` or `error`)
2. WHEN the request includes `ctx.requestId`, THE response `requestId` SHALL match it
3. WHEN the request includes `ctx.sessionId`, THE response SHALL include `sessionId` matching the provided value
4. WHEN `state` is `complete`, THE response SHALL include `result` and SHALL NOT include `error`
5. WHEN `state` is `error`, THE response SHALL include `error` with `code` (string) and `message` (string), and SHALL NOT include `result`
6. THE `result` and `error` fields SHALL be mutually exclusive in every response

### Requirement 3: CRUD Operations (REQ-CRUD)

**User Story:** As an API consumer, I want full CRUD operations on todo items, so that I can create, read, update, list, delete, and complete todos.

#### Acceptance Criteria

**Create:**
1. `v1:todos.create` SHALL accept `title` (required), `description`, `dueDate`, `labels` (all optional) and SHALL return a todo with generated `id`, `createdAt`, `updatedAt`, and `completed: false`

**Read:**
2. `v1:todos.get` SHALL accept `id` (required) and return the full todo object
3. WHEN the requested todo does not exist, `v1:todos.get` SHALL return `state=error` with code `TODO_NOT_FOUND`

**List:**
4. `v1:todos.list` SHALL accept optional `cursor`, `limit` (default 20, max 100), `completed` (boolean filter), and `label` (string filter)
5. `v1:todos.list` SHALL return `{ items, cursor, total }` where `items` is an array of todos, `cursor` is a string or null, and `total` is an integer

**Update:**
6. `v1:todos.update` SHALL accept `id` (required) plus any updatable field, performing a partial update that preserves unspecified fields
7. `v1:todos.update` SHALL update the `updatedAt` timestamp
8. WHEN the requested todo does not exist, `v1:todos.update` SHALL return `state=error` with code `TODO_NOT_FOUND`

**Delete:**
9. `v1:todos.delete` SHALL accept `id` (required) and return `{ deleted: true }`
10. WHEN the requested todo does not exist, `v1:todos.delete` SHALL return `state=error` with code `TODO_NOT_FOUND`

**Complete:**
11. `v1:todos.complete` SHALL set `completed: true` and `completedAt` to a timestamp
12. `v1:todos.complete` SHALL be idempotent — completing an already-completed todo SHALL succeed without error
13. WHEN the requested todo does not exist, `v1:todos.complete` SHALL return `state=error` with code `TODO_NOT_FOUND`

### Requirement 4: Error Handling (REQ-ERR)

**User Story:** As an API consumer, I want clear, consistent error responses, so that I can distinguish protocol errors from domain errors and handle them appropriately.

#### Acceptance Criteria

1. WHEN an unknown operation is invoked, THE server SHALL return HTTP 400 with `state=error` and code `UNKNOWN_OP`
2. WHEN the `op` field is missing or not a string, THE server SHALL return HTTP 400
3. WHEN required arguments are missing or have wrong types, THE server SHALL return HTTP 400 with `state=error` and code `VALIDATION_ERROR`
4. WHEN a domain error occurs (e.g. `TODO_NOT_FOUND`), THE server SHALL return HTTP 200 with `state=error`
5. WHEN the request body is not valid JSON, THE server SHALL return HTTP 400
6. EVERY error response SHALL include an `error` object with `code` (string) and `message` (string)

### Requirement 5: Idempotency (REQ-IDEM)

**User Story:** As an API consumer, I want to safely retry side-effecting operations without creating duplicates, so that network failures don't cause data inconsistency.

#### Acceptance Criteria

1. WHEN the same `ctx.idempotencyKey` is sent with `v1:todos.create`, THE server SHALL return the same result without creating a duplicate todo
2. WHEN different idempotency keys are used, THE server SHALL create different todos
3. WHEN no idempotency key is provided, THE server SHALL allow duplicate creation
4. NON-side-effecting operations SHALL ignore `ctx.idempotencyKey`

### Requirement 6: Auth (REQ-AUTH)

**User Story:** As an API operator, I want to protect operations with scoped auth tokens, so that only authorized clients can perform sensitive operations.

#### Acceptance Criteria

1. WHEN an operation requires auth scopes and no Authorization header is provided, THE server SHALL return HTTP 401 with code `AUTH_REQUIRED`
2. WHEN an invalid bearer token is provided, THE server SHALL return HTTP 401
3. WHEN a token lacks required scopes, THE server SHALL return HTTP 403 with code `INSUFFICIENT_SCOPE`
4. WHEN a valid token with correct scopes is provided, THE operation SHALL proceed normally
5. Write operations SHALL require `todos:write` scope; read operations SHALL require `todos:read` scope
6. THE registry SHALL declare `authScopes` for each operation

### Requirement 7: Async Execution (REQ-ASYNC)

**User Story:** As an API consumer, I want to invoke long-running operations that complete asynchronously, so that I can poll for results without blocking.

#### Acceptance Criteria

1. WHEN an async operation is invoked, THE server SHALL return HTTP 202 with `state=accepted` and `retryAfterMs`
2. THE client SHALL poll `GET /ops/{requestId}` to check operation progress
3. THE operation state SHALL transition from `accepted` through `pending` to `complete`
4. WHEN complete, the poll response SHALL include `result` and no `error`
5. WHEN polling a nonexistent requestId, THE server SHALL return HTTP 404
6. Async operations SHALL declare `executionModel: "async"` in the registry

### Requirement 8: Deprecated Operations (REQ-DEPR)

**User Story:** As an API consumer, I want clear signals when an operation is deprecated, so that I can migrate to replacement operations.

#### Acceptance Criteria

1. Deprecated operations SHALL declare `deprecated: true`, a `sunset` date (YYYY-MM-DD), and a `replacement` operation name
2. WHEN a deprecated operation past its sunset date is invoked, THE server SHALL return HTTP 410 with code `OP_REMOVED`
3. THE 410 error SHALL include `cause` with `removedOp` and `replacement` fields

### Requirement 9: Status Codes (REQ-STATUS)

**User Story:** As an API consumer, I want consistent error payloads for all HTTP error status codes.

#### Acceptance Criteria

1. HTTP 500, 502, and 503 responses SHALL include `state=error` with `code` and `message`
2. ALL error responses SHALL include `requestId`

### Requirement 10: Schema Evolution (REQ-EVOL)

**User Story:** As an API consumer, I want the API to evolve without breaking my client, following the robustness principle.

#### Acceptance Criteria

1. Clients SHALL successfully parse responses that contain extra unknown fields
2. Known fields SHALL retain correct values regardless of schema additions

### Requirement 11: Chunked Retrieval (REQ-CHUNK)

**User Story:** As an API consumer, I want to retrieve large async operation results in chunks with integrity verification.

#### Acceptance Criteria

1. Completed async operations SHALL support `GET /ops/{requestId}/chunks` with cursor-based pagination
2. Each chunk SHALL include `offset`, `data`, `checksum` (sha256:{hex}), `checksumPrevious`, `state`, and `cursor`
3. THE SHA-256 of chunk data SHALL match the declared checksum
4. THE `checksumPrevious` of each chunk SHALL match the `checksum` of the prior chunk (null for the first)

### Requirement 12: Media Handling (REQ-MEDIA)

**User Story:** As an API consumer, I want to upload files to todo items and retrieve them via content-addressed redirects.

#### Acceptance Criteria

1. `v1:todos.attach` SHALL accept multipart/form-data with `envelope` and `file` parts
2. After attachment, `v1:todos.get` SHALL include a `location` object with `uri` pointing to `/media/{id}`
3. `GET /media/{id}` SHALL return HTTP 303 with a `Location` header; following it SHALL return the binary data
4. THE registry SHALL declare `mediaSchema` with `name`, `acceptedTypes`, and `maxBytes`
5. Unsupported MIME types SHALL be rejected with an error

### Requirement 13: Streaming (REQ-STREAM)

**User Story:** As an API consumer, I want to receive real-time updates when todos change via WebSocket.

#### Acceptance Criteria

1. `v1:todos.watch` SHALL return HTTP 202 with `state=streaming` and a `stream` object containing `transport`, `location`, `sessionId`, `encoding`, and `expiresAt`
2. Connecting to the `stream.location` via WebSocket SHALL succeed
3. WHEN a todo is created or updated, THE WebSocket SHALL push a change event with the affected todo
4. THE registry SHALL declare `executionModel: "stream"` and `supportedTransports: ["wss"]`
