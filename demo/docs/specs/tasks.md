# Implementation Tasks

## Overview

This document outlines implementation tasks for the OpenCALL Demo Library project. Tasks follow TDD ordering where applicable: test infrastructure and tests are written before implementation code for all business logic phases. Non-TDD phases (scaffolding, schemas, frontend templates, static content, deployment) are clearly marked.

Each task references one or more requirement IDs from `requirements.md` for traceability. The 14 phases progress from project scaffolding through core infrastructure, operations, frontend, and deployment.

## Prerequisites

- [ ] Review and approve `requirements.md` (REQ-SPEC through REQ-SEED)
- [ ] Review and approve `design.md` (architecture, data models, interfaces)
- [ ] Bun runtime installed (v1.2+)
- [ ] Google Cloud project with Storage bucket provisioned
- [ ] Firebase CLI installed for static site deployment
- [ ] Access to Open Library API for seed data generation

---

## Phase 1: Project Scaffolding

> No TDD — configuration and schema files only.

### Task 1.1: Create API package.json

**File**: `demo/api/package.json`
**Description**: Initialize the API server package with all required dependencies and scripts.
**Changes**:
- Add `name`: `"@opencall-demo/api"`
- Add `dependencies`: `zod` (v4), `xstate` (v5)
- Add `devDependencies`: `@types/bun`
- Add `scripts`: `start` (`bun run src/server.ts`), `test` (`bun test`), `seed` (`bun run src/db/seed.ts`), `reset` (`bun run src/db/reset.ts`)

**Acceptance Criteria**:
- [ ] `bun install` succeeds with no errors
- [ ] `zod`, `xstate`, and `@types/bun` are listed in the correct dependency sections
- [ ] All four scripts (`start`, `test`, `seed`, `reset`) are defined
- [ ] REQ-SPEC: Package supports the Bun-first architecture

---

### Task 1.2: Create API tsconfig.json

**File**: `demo/api/tsconfig.json`
**Description**: Configure TypeScript for the Bun runtime environment.
**Changes**:
- Set `target`: `ESNext`, `module`: `ESNext`, `moduleResolution`: `bundler`
- Set `noEmit`: `true` (Bun runs TypeScript directly)
- Set `strict`: `true`, `skipLibCheck`: `true`
- Include `src/**/*.ts` and `tests/**/*.ts`

**Acceptance Criteria**:
- [ ] `bun run --bun tsc --noEmit` succeeds (once source files exist)
- [ ] Module resolution is set to `bundler` for Bun compatibility
- [ ] REQ-SPEC: TypeScript configuration supports Bun-native development

---

### Task 1.3: Create App package.json

**File**: `demo/app/package.json`
**Description**: Initialize the dashboard app package with minimal dependencies.
**Changes**:
- Add `name`: `"@opencall-demo/app"`
- Add `devDependencies`: `@types/bun`
- Add `scripts`: `start` (`bun run src/server.ts`), `test` (`bun test`)

**Acceptance Criteria**:
- [ ] `bun install` succeeds with no errors
- [ ] `start` and `test` scripts are defined
- [ ] REQ-APP: Package supports the dashboard app server

---

### Task 1.4: Create App tsconfig.json

**File**: `demo/app/tsconfig.json`
**Description**: Configure TypeScript for the Bun runtime environment in the app package.
**Changes**:
- Set `target`: `ESNext`, `module`: `ESNext`, `moduleResolution`: `bundler`
- Set `noEmit`: `true`, `strict`: `true`, `skipLibCheck`: `true`
- Include `src/**/*.ts`

**Acceptance Criteria**:
- [ ] Module resolution is set to `bundler` for Bun compatibility
- [ ] REQ-APP: TypeScript configuration supports Bun-native development

---

### Task 1.5: Create SQLite DDL schemas

**Files**: `demo/api/src/db/schema.sql`, `demo/app/src/db/schema.sql`
**Description**: Define all database tables and indexes for both the API and app databases.
**Changes**:
- **API schema** (`demo/api/src/db/schema.sql`): Create 8 tables — `catalog_items`, `patrons`, `lending_history`, `reservations`, `operations`, `auth_tokens`, `analytics_visitors`, `analytics_agents` — with all columns per the design document data model
- Add 12 indexes: `idx_lending_patron`, `idx_lending_item`, `idx_lending_overdue`, `idx_reservations_patron`, `idx_reservations_item`, `idx_tokens_patron`, `idx_tokens_expiry`, `idx_catalog_type`, `idx_catalog_available`, `idx_visitors_ip_ua`, `idx_agents_visitor`, `idx_agents_card`
- **App schema** (`demo/app/src/db/schema.sql`): Create `sessions` table with `sid`, `token`, `username`, `card_number`, `analytics_visitor_id`, `scopes`, `expires_at`, `created_at`; add `idx_sessions_expiry` index

**Acceptance Criteria**:
- [ ] All 8 API tables are defined with correct column types and constraints
- [ ] All 12 API indexes are created
- [ ] App sessions table is defined with correct columns
- [ ] `is_seed` flag exists on `patrons` and `lending_history` tables for reset preservation
- [ ] REQ-SEED: Schema supports seed data with `is_seed` flags
- [ ] REQ-ANALYTICS: Analytics tables (`analytics_visitors`, `analytics_agents`) are defined
- [ ] REQ-RESET: Schema design supports selective reset (seed data preserved)
- [ ] REQ-AUTH: `auth_tokens` table supports both `demo` and `agent` token types

---

### Task 1.6: Create database connection module

**File**: `demo/api/src/db/connection.ts`
**Description**: Implement the SQLite database connection using `bun:sqlite`, with auto-initialization from schema.sql.
**Changes**:
- Import `Database` from `bun:sqlite`
- Open `library.db` at the path specified by `DATABASE_PATH` env var (default `./library.db`)
- On first open, check if tables exist; if not, execute `schema.sql` to create them
- Export the database instance for use by other modules
- Enable WAL mode for concurrent read performance

**Acceptance Criteria**:
- [ ] Database file is created if it does not exist
- [ ] Schema is applied on first run (tables created)
- [ ] Subsequent opens skip schema application
- [ ] WAL mode is enabled
- [ ] REQ-SPEC: Database connection supports the Bun-native `bun:sqlite` API

---

### Task 1.7: Create shared types and error constructors

**Files**: `demo/api/src/call/envelope.ts`, `demo/api/src/call/errors.ts`
**Description**: Define the canonical OpenCALL request/response envelope Zod schemas and error constructor functions.
**Changes**:
- **envelope.ts**: Define `RequestEnvelopeSchema` (Zod object with `op`, `args`, `ctx`, `media` fields), `RequestEnvelope` type, `ResponseState` type, `ResponseEnvelope` interface — per design document section 1
- **errors.ts**: Implement `domainError(requestId, code, message, cause?)` returning `ResponseEnvelope` with `state=error`; implement `protocolError(code, message, httpStatus, cause?)` returning `{ status, body: ResponseEnvelope }` with server-generated `requestId`
- Export all types and functions

**Acceptance Criteria**:
- [ ] `RequestEnvelopeSchema` validates correctly (op required, args defaults to `{}`, ctx optional)
- [ ] `ResponseEnvelope` interface includes all fields: `requestId`, `sessionId?`, `state`, `result?`, `error?`, `location?`, `retryAfterMs?`, `expiresAt?`
- [ ] `domainError()` returns HTTP 200-compatible envelope with `state=error`
- [ ] `protocolError()` returns `{ status, body }` tuple with server-generated `requestId`
- [ ] Every error envelope includes a non-empty `message` field (no zero-information errors)
- [ ] REQ-SPEC: Envelope format matches the OpenCALL specification

---

## Phase 2: API Core Infrastructure

> TDD — write tests before implementation for dispatcher, auth, and scopes.

### Task 2.1: Write dispatcher tests

**File**: `demo/api/tests/call.test.ts`
**Description**: Write the initial test cases for the POST /call dispatcher, covering envelope shape, error handling, and method enforcement.
**Test Cases**:
- POST /call returns envelope with `requestId` (UUID format)
- Response echoes `ctx.requestId` when provided in the request
- Response echoes `sessionId` when `ctx.sessionId` is provided
- POST /call returns 400 with `INVALID_ENVELOPE` for missing `op` field
- POST /call returns 400 with `INVALID_ENVELOPE` for invalid JSON body
- POST /call returns 400 with `UNKNOWN_OPERATION` for unregistered operation name
- GET /call returns 405 with `METHOD_NOT_ALLOWED` and `Allow: POST` header

**Acceptance Criteria**:
- [ ] All 7 test cases are defined and initially fail (no implementation yet)
- [ ] Tests use `bun:test` (`import { test, expect, describe } from "bun:test"`)
- [ ] Tests validate full envelope structure, not just status codes
- [ ] REQ-SPEC: Tests cover AC 1-4 (request format), AC 10 (400 errors), AC 14 (405)

---

### Task 2.2: Implement dispatcher

**File**: `demo/api/src/call/dispatcher.ts`
**Description**: Implement the POST /call dispatcher that parses JSON, validates the envelope, resolves operation modules, and routes to handlers.
**Changes**:
- Parse request body as JSON; return `INVALID_ENVELOPE` (400) on parse failure
- Validate envelope shape using `RequestEnvelopeSchema`; return `INVALID_ENVELOPE` (400) if `op` is missing
- Look up operation module from registry; return `UNKNOWN_OPERATION` (400) if not found
- Generate `requestId` (UUID v4) if not provided in `ctx`
- Echo `ctx.requestId` and `ctx.sessionId` in the response
- Define `OpContext` and `OperationResult` types per design document section 2
- Integrate auth middleware and scope checking (stubs until Tasks 2.4-2.6)

**Acceptance Criteria**:
- [ ] All dispatcher tests from Task 2.1 pass
- [ ] JSON parse errors return 400 with meaningful message
- [ ] Missing `op` returns 400 with `INVALID_ENVELOPE` code
- [ ] Unknown operations return 400 with `UNKNOWN_OPERATION` code
- [ ] GET /call returns 405 with `Allow: POST` header
- [ ] REQ-SPEC: Dispatcher implements the canonical envelope parsing and routing

---

### Task 2.3: Write auth tests

**File**: `demo/api/tests/auth.test.ts`
**Description**: Write test cases for both human and agent authentication flows, token validation, and expiry handling.
**Test Cases**:
- POST /auth returns `{ token, username, cardNumber, scopes, expiresAt }`
- Generated username follows adjective-animal format when not provided
- POST /auth strips `items:manage` and `patron:billing` from requested scopes
- POST /auth/agent returns `{ token, username, patronId, cardNumber, scopes, expiresAt }`
- Agent token carries fixed scopes: `["items:browse", "items:read", "items:write", "patron:read"]`
- POST /auth/agent with invalid card format returns 400 `INVALID_CARD`
- POST /auth/agent with unknown card number returns 404 `PATRON_NOT_FOUND`
- Expired token returns 401 `AUTH_REQUIRED`
- Missing Authorization header on POST /call returns 401 `AUTH_REQUIRED`

**Acceptance Criteria**:
- [ ] All 9 test cases are defined and initially fail
- [ ] Tests validate response body shapes (token prefix, username format, scope arrays)
- [ ] REQ-AUTH: Tests cover AC 1-9 (human auth), AC 10-16 (agent auth), AC 17-20 (validation)

---

### Task 2.4: Implement tokens module

**File**: `demo/api/src/auth/tokens.ts`
**Description**: Implement token minting, storage, and lookup for both human and agent authentication.
**Changes**:
- `mintToken(type: "demo" | "agent")`: Generate token with appropriate prefix (`demo_` or `agent_`) followed by 32 random hex characters
- `storeToken(token: AuthToken)`: Insert into `auth_tokens` table
- `lookupToken(token: string)`: Query `auth_tokens`, return parsed `AuthToken` or null
- `isExpired(token: AuthToken)`: Check `expiresAt` against current time
- Token expiry is set to `now + 86400` seconds (24 hours)

**Acceptance Criteria**:
- [ ] `demo_` prefix tokens are 38 characters total (6 prefix + 32 hex)
- [ ] `agent_` prefix tokens are 38 characters total (6 prefix + 32 hex)
- [ ] Tokens are stored in and retrieved from SQLite
- [ ] Expired tokens are correctly identified
- [ ] REQ-AUTH: Token format and expiry match AC 6-7, AC 13

---

### Task 2.5: Implement scopes module

**File**: `demo/api/src/auth/scopes.ts`
**Description**: Define all scopes, scope-to-operation mapping, default scope sets, and never-granted scopes.
**Changes**:
- Define 7 scopes: `items:browse`, `items:read`, `items:write`, `items:manage`, `patron:read`, `patron:billing`, `reports:generate`
- Define `SCOPE_TO_OPS` mapping per the design document scope-to-operation matrix
- Define `DEFAULT_HUMAN_SCOPES`: `["items:browse", "items:read", "items:write", "patron:read", "reports:generate"]`
- Define `AGENT_SCOPES`: `["items:browse", "items:read", "items:write", "patron:read"]`
- Define `NEVER_GRANTED`: `["items:manage", "patron:billing"]`
- Implement `stripNeverGranted(scopes: string[])`: Remove `items:manage` and `patron:billing` from any scope array
- Implement `getRequiredScopes(op: string)`: Return required scopes for a given operation name

**Acceptance Criteria**:
- [ ] All 7 scopes are defined
- [ ] Scope-to-operation mapping covers all 11 operations
- [ ] `stripNeverGranted` removes `items:manage` and `patron:billing`
- [ ] `DEFAULT_HUMAN_SCOPES` excludes `items:manage` and `patron:billing`
- [ ] `AGENT_SCOPES` is the fixed set without `reports:generate`
- [ ] REQ-SCOPE: Scope definitions match AC 1-10

---

### Task 2.6: Implement auth middleware

**File**: `demo/api/src/auth/middleware.ts`
**Description**: Implement Bearer token extraction, validation, and scope enforcement middleware.
**Changes**:
- `authenticate(request: Request)`: Extract `Authorization: Bearer {token}` header, look up token, check expiry, return `OpContext` or error
- Return `AUTH_REQUIRED` (401) for missing header, unknown token, or expired token
- After authentication, integrate scope enforcement: compare required scopes for the operation against the token's granted scopes
- Return `INSUFFICIENT_SCOPES` (403) with missing scope names in `cause` field when scopes are insufficient

**Acceptance Criteria**:
- [ ] All auth tests from Task 2.3 pass
- [ ] Missing Authorization header returns 401
- [ ] Invalid/unknown token returns 401
- [ ] Expired token returns 401 with message indicating expiry
- [ ] Valid token with insufficient scopes returns 403 with missing scopes in `cause`
- [ ] Valid token with sufficient scopes returns `OpContext` with patron identity
- [ ] REQ-AUTH: Middleware implements AC 17-20
- [ ] REQ-SCOPE: Scope enforcement implements AC 11-12

---

## Phase 3: Registry Generation

> TDD — write tests before implementation.

### Task 3.1: Write registry tests

**File**: `demo/api/tests/registry.test.ts`
**Description**: Write test cases for the GET /.well-known/ops registry endpoint.
**Test Cases**:
- GET /.well-known/ops returns 200 with `Content-Type: application/json`
- Response body includes `callVersion` as `"2026-02-10"`
- `operations` array contains exactly 11 entries
- All 11 operation names are present: `v1:catalog.list`, `v1:catalog.listLegacy`, `v1:item.get`, `v1:item.getMedia`, `v1:item.return`, `v1:item.reserve`, `v1:patron.get`, `v1:patron.history`, `v1:patron.fines`, `v1:catalog.bulkImport`, `v1:report.generate`
- Each entry has all required fields: `op`, `argsSchema`, `resultSchema`, `sideEffecting`, `idempotencyRequired`, `executionModel`, `maxSyncMs`, `ttlSeconds`, `authScopes`, `cachingPolicy`
- `argsSchema` and `resultSchema` are valid JSON Schema objects (have `type` or `$schema` property)
- `v1:catalog.listLegacy` has `deprecated: true`, `sunset: "2026-06-01"`, `replacement: "v1:catalog.list"`
- Response includes `ETag` and `Cache-Control` headers
- Conditional request with matching `If-None-Match` returns 304 with no body

**Acceptance Criteria**:
- [ ] All 9 test cases are defined and initially fail
- [ ] Tests validate both the structure and semantic content of the registry
- [ ] REQ-REGISTRY: Tests cover AC 1-9

---

### Task 3.2: Implement JSDoc parser

**File**: `demo/api/src/ops/registry.ts` (partial)
**Description**: Implement the regex-based JSDoc tag parser that extracts operation metadata from source files.
**Changes**:
- Implement `parseJSDoc(sourceText: string)`: Extract JSDoc comment block preceding `export` keywords
- Parse individual tags: `@op`, `@execution`, `@timeout`, `@ttl`, `@security`, `@cache`, `@flags` (with `sideEffecting`, `idempotencyRequired`, `deprecated` modifiers), `@sunset`, `@replacement`
- Map parsed tags to `RegistryEntry` fields per the design document JSDoc-to-field mapping table
- Apply default values for missing tags per the design document defaults table

**Acceptance Criteria**:
- [ ] Parser correctly extracts all 11 JSDoc tag types
- [ ] `@flags` tag supports multiple flag values (e.g., `@flags sideEffecting idempotencyRequired`)
- [ ] Missing tags receive correct default values
- [ ] REQ-REGISTRY: JSDoc parser supports AC 7 (boot-time introspection)

---

### Task 3.3: Implement registry builder and GET handler

**File**: `demo/api/src/ops/registry.ts` (complete)
**Description**: Implement the boot-time registry builder that scans operation modules, generates JSON Schemas from Zod, combines with JSDoc metadata, and serves the registry with caching.
**Changes**:
- `buildRegistry()`: Scan `src/operations/*.ts`, dynamic import each module, call `z.toJSONSchema()` on exported `args` and `result` schemas, parse JSDoc from source files, combine into `RegistryEntry` objects
- Assemble full `RegistryResponse` with `callVersion: "2026-02-10"` and all entries
- Cache the serialized registry in memory at boot time
- Compute SHA-256 `ETag` from the serialized JSON
- Handle `GET /.well-known/ops`: return cached registry with `Content-Type: application/json`, `Cache-Control`, `ETag` headers
- Handle conditional requests: if `If-None-Match` matches current ETag, return 304

**Acceptance Criteria**:
- [ ] All registry tests from Task 3.1 pass
- [ ] Registry is built once at boot time and cached in memory
- [ ] `z.toJSONSchema()` produces valid JSON Schema objects for all operations
- [ ] ETag changes when registry content changes
- [ ] Conditional 304 responses work correctly
- [ ] REQ-REGISTRY: Registry builder implements AC 1-9

---

## Phase 4: Synchronous Operations

> TDD — for each operation group: write tests first, then implement operation module and service layer.

### Task 4.1: Write catalog.list tests

**File**: `demo/api/tests/call.test.ts` (append)
**Description**: Add test cases for the `v1:catalog.list` operation.
**Test Cases**:
- `v1:catalog.list` returns `state=complete` with `items` array containing correct shape (`id`, `type`, `title`, `creator`, `year`, `available`, `availableCopies`, `totalCopies`)
- Respects `type` filter (only returns items of specified type)
- Respects `search` filter (title or creator matching)
- Respects `available` filter (only available items when `true`)
- Respects `limit` and `offset` for pagination
- Result includes `total` count (total matching items, not just page size)

**Acceptance Criteria**:
- [ ] All 6 test cases are defined and initially fail
- [ ] Tests validate result shape and filtering behavior
- [ ] REQ-OPS-SYNC: Tests cover AC 1-3

---

### Task 4.2: Implement catalog.list operation

**File**: `demo/api/src/operations/catalog-list.ts`
**Description**: Define Zod schemas, JSDoc metadata, and handler for the `v1:catalog.list` operation.
**Changes**:
- Define `args` Zod schema: `type` (string, optional), `search` (string, optional), `available` (boolean, optional), `limit` (integer, 1-100, default 20), `offset` (integer, min 0, default 0)
- Define `result` Zod schema: `items` (array of item objects), `total` (integer), `limit` (integer), `offset` (integer)
- Add JSDoc block: `@op v1:catalog.list`, `@execution sync`, `@timeout 5000`, `@ttl 3600`, `@security items:browse`, `@cache server`
- Implement `handler` that delegates to catalog service

**Acceptance Criteria**:
- [ ] Zod schemas validate correctly for all valid and invalid inputs
- [ ] JSDoc tags produce correct registry entry
- [ ] Handler delegates to catalog service and returns result envelope
- [ ] REQ-OPS-SYNC: Implements AC 1-3
- [ ] REQ-REGISTRY: JSDoc metadata matches registry requirements

---

### Task 4.3: Implement catalog service

**File**: `demo/api/src/services/catalog.ts`
**Description**: Implement SQLite queries for catalog listing with filtering and pagination.
**Changes**:
- `listItems(filters)`: Build parameterized SQL query against `catalog_items` table
- Support `type` filter (WHERE `type = ?`)
- Support `search` filter (WHERE `title LIKE ? OR creator LIKE ?`)
- Support `available` filter (WHERE `available = 1`)
- Support `limit` and `offset` for pagination
- Return `{ items, total }` where `total` is the count of all matching rows (not just the page)
- `getItem(itemId)`: Fetch single item by ID, return item or null

**Acceptance Criteria**:
- [ ] All catalog.list tests from Task 4.1 pass
- [ ] Filters combine correctly (AND logic)
- [ ] Pagination returns correct subsets
- [ ] Total count reflects all matching items
- [ ] REQ-OPS-SYNC: Catalog service supports AC 1-3

---

### Task 4.4: Write catalog.listLegacy tests

**File**: `demo/api/tests/call.test.ts` (append)
**Description**: Add test cases for the deprecated `v1:catalog.listLegacy` operation.
**Test Cases**:
- `v1:catalog.listLegacy` returns same result shape as `v1:catalog.list`
- Operation delegates to same underlying service (identical results for identical args)
- Registry entry has `deprecated: true`, `sunset: "2026-06-01"`, `replacement: "v1:catalog.list"`

**Acceptance Criteria**:
- [ ] All 3 test cases are defined and initially fail
- [ ] Tests verify functional equivalence with `v1:catalog.list`
- [ ] REQ-OPS-SYNC: Tests cover AC 4-7
- [ ] REQ-DEPRECATION: Tests cover AC 1-2

---

### Task 4.5: Implement catalog.listLegacy operation

**File**: `demo/api/src/operations/catalog-list-legacy.ts`
**Description**: Define the deprecated `v1:catalog.listLegacy` operation that delegates to the catalog service.
**Changes**:
- Reuse same `args` and `result` Zod schemas as `catalog-list.ts`
- Add JSDoc block: `@op v1:catalog.listLegacy`, `@execution sync`, `@timeout 5000`, `@ttl 3600`, `@security items:browse`, `@cache server`, `@flags deprecated`, `@sunset 2026-06-01`, `@replacement v1:catalog.list`
- Implement `handler` that delegates to the same catalog service as `v1:catalog.list`
- Add sunset date check: if current date is on or after 2026-06-01, return `OP_REMOVED` (410) with replacement info in `cause`

**Acceptance Criteria**:
- [ ] All catalog.listLegacy tests from Task 4.4 pass
- [ ] Delegates to the same catalog service
- [ ] JSDoc produces correct deprecated registry metadata
- [ ] Sunset enforcement returns 410 with `OP_REMOVED` when past sunset date
- [ ] REQ-OPS-SYNC: Implements AC 4-7
- [ ] REQ-DEPRECATION: Implements AC 1-5

---

### Task 4.6: Write item.get tests

**File**: `demo/api/tests/call.test.ts` (append)
**Description**: Add test cases for the `v1:item.get` operation.
**Test Cases**:
- `v1:item.get` returns full item record with all fields for a valid itemId
- `v1:item.get` returns domain error `ITEM_NOT_FOUND` (HTTP 200, `state=error`) for nonexistent itemId

**Acceptance Criteria**:
- [ ] Both test cases are defined and initially fail
- [ ] Tests validate domain error structure (code, message, state)
- [ ] REQ-OPS-SYNC: Tests cover AC 8-11

---

### Task 4.7: Implement item.get operation

**File**: `demo/api/src/operations/item-get.ts`
**Description**: Define Zod schemas, JSDoc metadata, and handler for the `v1:item.get` operation.
**Changes**:
- Define `args` schema: `itemId` (string, required)
- Define `result` schema: full `CatalogItem` fields
- Add JSDoc block: `@op v1:item.get`, `@execution sync`, `@timeout 5000`, `@ttl 3600`, `@security items:read`, `@cache server`
- Implement `handler`: call `catalog.getItem(itemId)`, return result or `ITEM_NOT_FOUND` domain error

**Acceptance Criteria**:
- [ ] All item.get tests from Task 4.6 pass
- [ ] Returns full item record on success
- [ ] Returns `ITEM_NOT_FOUND` domain error for missing items
- [ ] REQ-OPS-SYNC: Implements AC 8-11

---

### Task 4.8: Write item.getMedia tests

**File**: `demo/api/tests/call.test.ts` (append)
**Description**: Add test cases for the `v1:item.getMedia` operation.
**Test Cases**:
- `v1:item.getMedia` returns 303 with `Location` header for items with `coverImageKey`
- `v1:item.getMedia` returns 200 with placeholder result for items without cover images
- `v1:item.getMedia` returns domain error `ITEM_NOT_FOUND` for nonexistent itemId

**Acceptance Criteria**:
- [ ] All 3 test cases are defined and initially fail
- [ ] Tests validate 303 redirect behavior (Location header + `location.uri` in body)
- [ ] REQ-OPS-SYNC: Tests cover AC 12-16

---

### Task 4.9: Implement item.getMedia operation and media service

**Files**: `demo/api/src/operations/item-get-media.ts`, `demo/api/src/services/media.ts`
**Description**: Implement the media redirect operation and GCS signed URL generation service.
**Changes**:
- **item-get-media.ts**: Define `args` schema (`itemId` required), `result` schema, JSDoc (`@op v1:item.getMedia`, `@execution sync`, `@timeout 5000`, `@ttl 3600`, `@security items:read`, `@cache location`)
- Implement handler: look up item, check `coverImageKey`, return redirect or placeholder
- **media.ts**: Implement `getSignedUrl(objectKey)`: Generate GCS signed URL with 1-hour expiry; implement `getPlaceholderUrl()`: Return placeholder image URL

**Acceptance Criteria**:
- [ ] All item.getMedia tests from Task 4.8 pass
- [ ] Items with covers return 303 with signed GCS URL
- [ ] Items without covers return 200 with placeholder
- [ ] Missing items return `ITEM_NOT_FOUND` domain error
- [ ] REQ-OPS-SYNC: Implements AC 12-16

---

### Task 4.10: Write item.return tests

**File**: `demo/api/tests/call.test.ts` (append)
**Description**: Add test cases for the `v1:item.return` operation.
**Test Cases**:
- Successful return includes `itemId`, `title`, `returnedAt`, `wasOverdue`, `daysLate`, `message`
- Returns `wasOverdue: true` and positive `daysLate` for overdue items
- Returns domain error `ITEM_NOT_FOUND` for nonexistent itemId
- Returns domain error `ITEM_NOT_CHECKED_OUT` when the patron does not have the item checked out
- Successful return increments `availableCopies` on the catalog item

**Acceptance Criteria**:
- [ ] All 5 test cases are defined and initially fail
- [ ] Tests validate the full result shape and side effects
- [ ] REQ-OPS-SYNC: Tests cover AC 17-22

---

### Task 4.11: Implement item.return operation

**File**: `demo/api/src/operations/item-return.ts`
**Description**: Define Zod schemas, JSDoc metadata, and handler for the `v1:item.return` operation.
**Changes**:
- Define `args` schema: `itemId` (string, required)
- Define `result` schema: `itemId`, `title`, `returnedAt`, `wasOverdue` (boolean), `daysLate` (integer), `message` (string)
- Add JSDoc block: `@op v1:item.return`, `@execution sync`, `@timeout 5000`, `@security items:write`, `@flags sideEffecting idempotencyRequired`
- Implement handler: delegate to lending service for return logic

**Acceptance Criteria**:
- [ ] All item.return tests from Task 4.10 pass
- [ ] Handler correctly delegates to lending service
- [ ] REQ-OPS-SYNC: Implements AC 17-22

---

### Task 4.12: Implement lending service

**File**: `demo/api/src/services/lending.ts`
**Description**: Implement lending business logic for returning items and checking overdue status.
**Changes**:
- `returnItem(patronId, itemId)`: Look up active lending record, validate ownership, mark as returned, calculate `wasOverdue` and `daysLate`, increment `availableCopies`
- `getOverdueItems(patronId)`: Query lending records where `return_date IS NULL` and `due_date < now()`
- `hasOverdueItems(patronId)`: Return boolean and count
- `getActiveCheckout(patronId, itemId)`: Find active lending record for the patron+item pair

**Acceptance Criteria**:
- [ ] Return logic correctly marks records and updates availability
- [ ] Overdue calculation is correct (days between due date and current date)
- [ ] `availableCopies` increments on return
- [ ] REQ-OPS-SYNC: Lending service supports AC 17-22, AC 23-29

---

### Task 4.13: Write item.reserve tests

**File**: `demo/api/tests/call.test.ts` (append)
**Description**: Add test cases for the `v1:item.reserve` operation.
**Test Cases**:
- Successful reservation returns `reservationId`, `itemId`, `title`, `status: "pending"`, `reservedAt`, `message`
- Returns domain error `OVERDUE_ITEMS_EXIST` with `count` and `hint` when patron has overdue items
- Returns domain error `ITEM_NOT_FOUND` for nonexistent itemId
- Returns domain error `ITEM_NOT_AVAILABLE` when item has zero available copies
- Returns domain error `ALREADY_RESERVED` when patron has active reservation for the item

**Acceptance Criteria**:
- [ ] All 5 test cases are defined and initially fail
- [ ] Tests validate the overdue error includes `count` and `hint` in `cause`
- [ ] REQ-OPS-SYNC: Tests cover AC 23-29

---

### Task 4.14: Implement item.reserve operation

**File**: `demo/api/src/operations/item-reserve.ts`
**Description**: Define Zod schemas, JSDoc metadata, and handler for the `v1:item.reserve` operation.
**Changes**:
- Define `args` schema: `itemId` (string, required)
- Define `result` schema: `reservationId`, `itemId`, `title`, `status`, `reservedAt`, `message`
- Add JSDoc block: `@op v1:item.reserve`, `@execution sync`, `@timeout 5000`, `@security items:write`, `@flags sideEffecting idempotencyRequired`
- Implement handler: check overdue items first (using lending service), then check item existence, availability, existing reservation, then create reservation

**Acceptance Criteria**:
- [ ] All item.reserve tests from Task 4.13 pass
- [ ] Overdue check happens before all other checks
- [ ] `OVERDUE_ITEMS_EXIST` error includes `count` and `hint` suggesting `v1:patron.get`
- [ ] REQ-OPS-SYNC: Implements AC 23-29

---

### Task 4.15: Write patron.get tests

**File**: `demo/api/tests/call.test.ts` (append)
**Description**: Add test cases for the `v1:patron.get` operation.
**Test Cases**:
- Returns patron data: `patronId`, `patronName`, `cardNumber`, `overdueItems`, `totalOverdue`, `activeReservations`, `totalCheckedOut`
- Newly created patron has at least 2 items in the `overdueItems` array

**Acceptance Criteria**:
- [ ] Both test cases are defined and initially fail
- [ ] Tests validate the overdue seeding guarantee
- [ ] REQ-OPS-SYNC: Tests cover AC 30-33

---

### Task 4.16: Implement patron.get operation

**File**: `demo/api/src/operations/patron-get.ts`
**Description**: Define Zod schemas, JSDoc metadata, and handler for the `v1:patron.get` operation.
**Changes**:
- Define `args` schema: empty object (patron identity derived from token)
- Define `result` schema: `patronId`, `patronName`, `cardNumber`, `overdueItems` (array), `totalOverdue` (integer), `activeReservations` (integer), `totalCheckedOut` (integer)
- Add JSDoc block: `@op v1:patron.get`, `@execution sync`, `@timeout 5000`, `@security patron:read`
- Implement handler: query patron record, overdue items, reservations, and checkout counts

**Acceptance Criteria**:
- [ ] All patron.get tests from Task 4.15 pass
- [ ] Patron identity is derived from `OpContext`, not from args
- [ ] Overdue items array includes item details for agent/UI display
- [ ] REQ-OPS-SYNC: Implements AC 30-33

---

### Task 4.17: Write patron.history tests

**File**: `demo/api/tests/call.test.ts` (append)
**Description**: Add test cases for the `v1:patron.history` operation.
**Test Cases**:
- Returns paginated lending records with `patronId`, `records`, `total`, `limit`, `offset`
- `status` filter correctly filters records by `"active"`, `"returned"`, or `"overdue"`

**Acceptance Criteria**:
- [ ] Both test cases are defined and initially fail
- [ ] Tests validate pagination and filtering
- [ ] REQ-OPS-SYNC: Tests cover AC 34-36

---

### Task 4.18: Implement patron.history operation

**File**: `demo/api/src/operations/patron-history.ts`
**Description**: Define Zod schemas, JSDoc metadata, and handler for the `v1:patron.history` operation.
**Changes**:
- Define `args` schema: `limit` (integer, optional), `offset` (integer, optional), `status` (enum: `"active"`, `"returned"`, `"overdue"`, optional)
- Define `result` schema: `patronId`, `records` (array of lending records), `total` (integer), `limit` (integer), `offset` (integer)
- Add JSDoc block: `@op v1:patron.history`, `@execution sync`, `@timeout 5000`, `@security patron:read`
- Implement handler: query lending history with filters and pagination

**Acceptance Criteria**:
- [ ] All patron.history tests from Task 4.17 pass
- [ ] Status filter maps correctly: `"active"` = checked out + not overdue, `"returned"` = returned, `"overdue"` = checked out + past due
- [ ] REQ-OPS-SYNC: Implements AC 34-36

---

### Task 4.19: Implement patron.fines operation

**File**: `demo/api/src/operations/patron-fines.ts`
**Description**: Define Zod schemas, JSDoc metadata, and handler for the `v1:patron.fines` operation. This operation always returns 403 via scope enforcement.
**Changes**:
- Define `args` schema: empty object
- Define `result` schema: placeholder (fines object)
- Add JSDoc block: `@op v1:patron.fines`, `@execution sync`, `@timeout 5000`, `@security patron:billing`
- Handler is never reached because `patron:billing` is never granted

**Acceptance Criteria**:
- [ ] Operation appears in the registry with correct metadata
- [ ] Any authenticated call returns 403 `INSUFFICIENT_SCOPES` with `"patron:billing"` in cause
- [ ] REQ-OPS-SYNC: Implements AC 37-38
- [ ] REQ-SCOPE: Demonstrates never-granted scope enforcement (AC 9-10)

---

## Phase 5: Async Operations + XState

> TDD — write tests for XState lifecycle, polling, chunks, and report generation before implementation.

### Task 5.1: Write XState lifecycle tests

**File**: `demo/api/tests/polling.test.ts`
**Description**: Write test cases for the XState state machine managing async operation lifecycle.
**Test Cases**:
- State transitions: `accepted` -> (START) -> `pending` -> (COMPLETE) -> `complete`
- State transitions: `accepted` -> (FAIL) -> `error`
- State transitions: `pending` -> (FAIL) -> `error`
- Machine state is persisted to SQLite `operations` table after each transition

**Acceptance Criteria**:
- [ ] All 4 test cases are defined and initially fail
- [ ] Tests validate state persistence in SQLite
- [ ] REQ-OPS-ASYNC: Tests cover AC 7-8

---

### Task 5.2: Implement XState machine and lifecycle service

**File**: `demo/api/src/services/lifecycle.ts`
**Description**: Implement the XState v5 state machine for async operation lifecycle with SQLite persistence.
**Changes**:
- Define XState machine with states: `accepted`, `pending`, `complete`, `error`
- Define events: `START`, `COMPLETE` (with `resultLocation`), `FAIL` (with `message`)
- Implement `createOperation(requestId, op, args, patronId)`: Insert into `operations` table with `state=accepted`
- Implement `transitionOperation(requestId, event)`: Send event to machine, persist new state
- Implement `getOperationState(requestId)`: Query `operations` table, return current state and metadata

**Acceptance Criteria**:
- [ ] All XState lifecycle tests from Task 5.1 pass
- [ ] State machine uses XState v5 `createMachine` API
- [ ] Every state transition is persisted to SQLite
- [ ] REQ-OPS-ASYNC: Implements AC 7-8

---

### Task 5.3: Write polling handler tests

**File**: `demo/api/tests/polling.test.ts` (append)
**Description**: Add test cases for the `GET /ops/{requestId}` polling endpoint.
**Test Cases**:
- GET /ops/{requestId} returns correct state and envelope for a known requestId
- GET /ops/{requestId} returns 404 `OPERATION_NOT_FOUND` for unknown requestId
- GET /ops/{requestId} returns 429 `RATE_LIMITED` with `retryAfterMs` for too-frequent polling

**Acceptance Criteria**:
- [ ] All 3 test cases are defined and initially fail
- [ ] Tests validate envelope structure including `retryAfterMs` on 429
- [ ] REQ-OPS-ASYNC: Tests cover AC 4-6

---

### Task 5.4: Implement polling handler

**File**: `demo/api/src/ops/polling.ts`
**Description**: Implement the GET /ops/{requestId} endpoint for async operation status polling.
**Changes**:
- Look up operation by `requestId` in SQLite
- Return 404 if not found or expired
- Track last poll time per requestId; return 429 with `retryAfterMs` if polled too frequently
- Return response envelope with current `state`, `location` (if complete), `error` (if error), `retryAfterMs` (if pending)

**Acceptance Criteria**:
- [ ] All polling tests from Task 5.3 pass
- [ ] 404 for unknown requestId
- [ ] 429 for too-frequent polling with `retryAfterMs`
- [ ] Correct envelope for each state (accepted, pending, complete, error)
- [ ] REQ-OPS-ASYNC: Implements polling behavior

---

### Task 5.5: Write chunk handler tests

**File**: `demo/api/tests/chunks.test.ts`
**Description**: Write test cases for the `GET /ops/{requestId}/chunks` chunked retrieval endpoint.
**Test Cases**:
- Chunks use cursor-based pagination (first request without cursor, subsequent with cursor)
- Each chunk is no larger than 64KB
- Each chunk has `checksum` in format `sha256:{hex}`
- `checksumPrevious` chains correctly (null for first chunk, previous chunk's checksum for subsequent)
- Intermediate chunks have `state=pending` and non-null `cursor`
- Final chunk has `state=complete` and `cursor=null`
- Chunk `data` contains raw text content (not base64)

**Acceptance Criteria**:
- [ ] All 7 test cases are defined and initially fail
- [ ] Tests validate the full checksum chain integrity
- [ ] REQ-CHUNKS: Tests cover AC 1-10

---

### Task 5.6: Implement chunk handler

**File**: `demo/api/src/ops/chunks.ts`
**Description**: Implement the `GET /ops/{requestId}/chunks` endpoint for chunked result retrieval.
**Changes**:
- Look up operation by `requestId`; return 404 if not found
- Slice the result payload into chunks of at most 64KB each
- For each chunk, compute SHA-256 checksum of the `data` content
- Chain checksums: first chunk has `checksumPrevious: null`, subsequent chunks reference the previous chunk's checksum
- Return `state=pending` with `cursor` for non-final chunks; `state=complete` with `cursor: null` for the final chunk
- Include `offset`, `length`, `mimeType`, `total` fields

**Acceptance Criteria**:
- [ ] All chunk tests from Task 5.5 pass
- [ ] Chunks are at most 64KB
- [ ] SHA-256 checksum chain is correct and verifiable
- [ ] Raw text data (not base64 encoded)
- [ ] REQ-CHUNKS: Implements AC 1-10

---

### Task 5.7: Write report.generate tests

**File**: `demo/api/tests/polling.test.ts` (append)
**Description**: Add test cases for the `v1:report.generate` async operation.
**Test Cases**:
- POST /call with `v1:report.generate` returns 202 with `state=accepted` and `location.uri` pointing to `/ops/{requestId}`
- `retryAfterMs` is set to 1000 and `expiresAt` is set to now + 3600 seconds
- Polling shows `state=pending` during generation (3-5 second simulated delay)
- Polling eventually shows `state=complete` with `location.uri` pointing to a GCS URL
- Chunks are available via `GET /ops/{requestId}/chunks` after completion

**Acceptance Criteria**:
- [ ] All 5 test cases are defined and initially fail
- [ ] Tests exercise the full async lifecycle end-to-end
- [ ] REQ-OPS-ASYNC: Tests cover AC 1-6, AC 9-10

---

### Task 5.8: Implement report.generate operation and reports service

**Files**: `demo/api/src/operations/report-generate.ts`, `demo/api/src/services/reports.ts`
**Description**: Implement the async report generation operation with XState lifecycle management.
**Changes**:
- **report-generate.ts**: Define `args` schema (`format`, `itemType`, `dateFrom`, `dateTo`), `result` schema, JSDoc (`@op v1:report.generate`, `@execution async`, `@timeout 30000`, `@security reports:generate`, `@flags sideEffecting idempotencyRequired`)
- Handler: create operation record (accepted), kick off async generation, return 202 envelope
- **reports.ts**: Implement `generateReport(requestId, args)`: Query lending data, format as CSV or JSON, upload to GCS, slice into chunks for chunk retrieval, transition operation to complete
- Simulated delay of 3-5 seconds for demo purposes

**Acceptance Criteria**:
- [ ] All report.generate tests from Task 5.7 pass
- [ ] Initial response is 202 with correct envelope fields
- [ ] Report is uploaded to GCS and available via signed URL
- [ ] Chunks are available after completion
- [ ] REQ-OPS-ASYNC: Implements AC 1-6, AC 9-10

---

### Task 5.9: Implement catalog.bulkImport operation

**File**: `demo/api/src/operations/catalog-bulk-import.ts`
**Description**: Define the `v1:catalog.bulkImport` async operation that always returns 403 via scope enforcement.
**Changes**:
- Define `args` schema: `items` (array of catalog item objects)
- Define `result` schema: placeholder (import result)
- Add JSDoc block: `@op v1:catalog.bulkImport`, `@execution async`, `@timeout 30000`, `@security items:manage`, `@flags sideEffecting idempotencyRequired`
- Handler is never reached because `items:manage` is never granted

**Acceptance Criteria**:
- [ ] Operation appears in the registry as a fully described async operation
- [ ] Any authenticated call returns 403 `INSUFFICIENT_SCOPES` with `"items:manage"` in cause
- [ ] REQ-OPS-ASYNC: Implements AC 11-13
- [ ] REQ-SCOPE: Demonstrates never-granted scope enforcement on async operations

---

## Phase 6: Seed Data

> No TDD — data generation scripts.

### Task 6.1: Implement seed script

**File**: `demo/api/src/db/seed.ts`
**Description**: Generate and load realistic library catalog data, patrons, and lending history into the SQLite database.
**Changes**:
- Fetch ~150 book items from the Open Library API (titles, authors, years, ISBNs)
- Generate ~50 non-book items using faker (CDs, DVDs, board games) with plausible metadata
- Generate ~50 patron records with faker names and stable card numbers (format `XXXX-XXXX-XX`)
- Generate ~5000 lending history records distributed across patrons
- Ensure every patron has at least 2 overdue items (lending records with `return_date IS NULL` and past `due_date`)
- Set `totalCopies` randomly (1-5) and `availableCopies` randomly (0-totalCopies) for each item
- Mark all seed records with `is_seed = 1`

**Acceptance Criteria**:
- [ ] ~200 catalog items are created (mix of books, CDs, DVDs, board games)
- [ ] ~50 patron records exist with unique card numbers
- [ ] ~5000 lending records are distributed across patrons
- [ ] Every patron has at least 2 overdue items
- [ ] All seed records have `is_seed = 1`
- [ ] REQ-SEED: Implements AC 1-13

---

### Task 6.2: Download cover images

**File**: `demo/api/src/db/seed.ts` (extend)
**Description**: Download cover images from Open Library and upload to GCS as part of the seed process.
**Changes**:
- Download ~50 book covers from the Open Library Covers API
- Upload downloaded images to the GCS bucket
- Set `cover_image_key` on catalog items that have covers
- Upload a placeholder image to GCS for items without covers
- Handle download failures gracefully (skip items, use placeholder)

**Acceptance Criteria**:
- [ ] ~50 cover images are stored in GCS
- [ ] Catalog items with covers have `cover_image_key` set
- [ ] A placeholder image exists in GCS
- [ ] Download failures are handled gracefully
- [ ] REQ-SEED: Implements AC 4-5

---

### Task 6.3: Implement reset script

**File**: `demo/api/src/db/reset.ts`
**Description**: Implement the database reset logic that wipes transient data while preserving seed data and analytics.
**Changes**:
- Delete all rows from `auth_tokens`
- Delete all rows from `operations`
- Delete all rows from `reservations`
- Delete rows from `patrons` where `is_seed = 0`
- Delete rows from `lending_history` where `is_seed = 0`
- Restore seed lending records to original state (set `return_date = NULL` for overdue items that were returned during the session)
- Preserve all rows in `analytics_visitors` and `analytics_agents`
- Preserve all rows in `catalog_items`

**Acceptance Criteria**:
- [ ] Transient data (tokens, operations, reservations, non-seed patrons/lending) is deleted
- [ ] Seed data is preserved and restored to original state
- [ ] Analytics tables are untouched
- [ ] Catalog items are untouched
- [ ] REQ-RESET: Implements AC 1-7

---

## Phase 7: API Server Entry Point

> Mixed TDD — error handling tests first, then server wiring.

### Task 7.1: Write error handling tests

**File**: `demo/api/tests/errors.test.ts`
**Description**: Write comprehensive test cases for all protocol and domain error codes.
**Test Cases**:
- 400 `INVALID_ENVELOPE`: missing op field
- 400 `UNKNOWN_OPERATION`: unregistered operation name
- 400 `SCHEMA_VALIDATION_FAILED`: invalid args for a known operation (Zod error details in `cause`)
- 401 `AUTH_REQUIRED`: missing Authorization header
- 403 `INSUFFICIENT_SCOPES`: valid token, missing required scope (lists missing scopes in `cause`)
- 404 `OPERATION_NOT_FOUND`: unknown requestId on GET /ops/{requestId}
- 405 `METHOD_NOT_ALLOWED`: GET /call (includes `Allow: POST` header)
- 410 `OP_REMOVED`: calling deprecated operation past sunset date (includes `removedOp` and `replacement` in `cause`)
- 429 `RATE_LIMITED`: too-frequent polling (includes `retryAfterMs`)
- 500 `INTERNAL_ERROR`: server error returns full error envelope with meaningful message
- Domain errors return HTTP 200 with `state=error`
- Every error response includes a non-empty `message` field (no zero-information responses)

**Acceptance Criteria**:
- [ ] All 12 test cases are defined and initially fail
- [ ] Tests validate both HTTP status codes and envelope structures
- [ ] REQ-SPEC: Tests cover AC 10-21 (all HTTP status codes and error semantics)
- [ ] REQ-DEPRECATION: Tests cover AC 3-5 (OP_REMOVED)

---

### Task 7.2: Implement server.ts

**File**: `demo/api/src/server.ts`
**Description**: Implement the API server entry point using Bun.serve() with the complete route table.
**Changes**:
- Use `Bun.serve()` with route table:
  - `POST /call` -> dispatcher
  - `GET /call` -> 405 METHOD_NOT_ALLOWED with `Allow: POST` header
  - `GET /.well-known/ops` -> registry handler
  - `GET /ops/:requestId` -> polling handler
  - `GET /ops/:requestId/chunks` -> chunks handler
  - `POST /auth` -> human auth handler
  - `POST /auth/agent` -> agent auth handler
  - `POST /admin/reset` -> reset handler (authenticated with ADMIN_SECRET)
- Initialize database on startup
- Build registry on startup (boot-time scan of operation modules)
- Read `PORT` from environment (default 8080)

**Acceptance Criteria**:
- [ ] Server starts on configured port
- [ ] All routes are correctly wired
- [ ] Registry is built at boot time
- [ ] Database is initialized at startup
- [ ] REQ-SPEC: Server implements the canonical route table

---

### Task 7.3: Wire all handlers and verify all tests pass

**Files**: Multiple (integration wiring across all API modules)
**Description**: Final integration pass to connect dispatcher, auth, scopes, registry, polling, chunks, and all operation handlers. Verify all 6 test files pass.
**Changes**:
- Ensure dispatcher integrates auth middleware before dispatching
- Ensure scope enforcement uses registry-declared scopes
- Ensure Zod validation runs after scope check
- Ensure all 11 operations are correctly registered and dispatchable
- Wire reset endpoint with ADMIN_SECRET authentication
- Fix any integration issues discovered during test execution

**Acceptance Criteria**:
- [ ] `demo/api/tests/call.test.ts` — all tests pass
- [ ] `demo/api/tests/registry.test.ts` — all tests pass
- [ ] `demo/api/tests/polling.test.ts` — all tests pass
- [ ] `demo/api/tests/chunks.test.ts` — all tests pass
- [ ] `demo/api/tests/auth.test.ts` — all tests pass
- [ ] `demo/api/tests/errors.test.ts` — all tests pass
- [ ] `bun test` in `demo/api/` passes with zero failures
- [ ] REQ-SPEC through REQ-CHUNKS: All API requirements verified by tests

---

## Phase 8: App Server

> TDD — write tests for sessions and proxy before implementation.

### Task 8.1: Write session store tests

**File**: `demo/app/tests/session.test.ts`
**Description**: Write test cases for the server-side session store.
**Test Cases**:
- Create session returns a session with valid `sid`
- Get session by `sid` returns the stored session data
- Delete session removes the session
- Expired session returns null on lookup

**Acceptance Criteria**:
- [ ] All 4 test cases are defined and initially fail
- [ ] Tests validate session lifecycle (create, read, delete, expiry)
- [ ] REQ-APP: Tests cover session management requirements

---

### Task 8.2: Implement session store

**File**: `demo/app/src/session.ts`
**Description**: Implement server-side session management using SQLite.
**Changes**:
- `createSession(data)`: Generate UUID `sid`, insert into `sessions` table, return session
- `getSession(sid)`: Query by `sid`, check expiry, return session or null
- `deleteSession(sid)`: Delete row from `sessions` table
- Database initialization: create sessions table if not exists using `demo/app/src/db/schema.sql`
- Session expiry matches token expiry (24 hours)

**Acceptance Criteria**:
- [ ] All session store tests from Task 8.1 pass
- [ ] Sessions are stored in SQLite
- [ ] Expired sessions return null
- [ ] REQ-APP: Session store supports AC 3-4

---

### Task 8.3: Write proxy tests

**File**: `demo/app/tests/proxy.test.ts`
**Description**: Write test cases for the API proxy module.
**Test Cases**:
- `POST /api/call` forwards to API server with `Authorization: Bearer` header
- Proxy returns both the API response and the original request metadata (method, URL, headers, body)
- Token is masked in the returned metadata (e.g., `demo_***`)

**Acceptance Criteria**:
- [ ] All 3 test cases are defined and initially fail
- [ ] Tests validate proxy forwarding and metadata enrichment
- [ ] REQ-APP: Tests cover AC 5-8

---

### Task 8.4: Implement proxy module

**File**: `demo/app/src/proxy.ts`
**Description**: Implement the API call proxy that forwards requests to the API server with authentication.
**Changes**:
- `proxyCall(request, session)`: Extract body from incoming request, forward to `API_URL/call` with `Authorization: Bearer {session.token}`, return `{ response, requestMeta }` where `requestMeta` includes method, URL, headers (with masked token), and body
- Token masking: replace token value with prefix + `***` (e.g., `demo_***`)
- Read `API_URL` from environment variable

**Acceptance Criteria**:
- [ ] All proxy tests from Task 8.3 pass
- [ ] Requests are forwarded with correct Authorization header
- [ ] Response includes both API response and request metadata
- [ ] Token is masked in metadata
- [ ] REQ-APP: Proxy implements AC 5-8

---

### Task 8.5: Implement auth handler

**File**: `demo/app/src/auth.ts`
**Description**: Implement the app-side authentication flow that proxies to the API and creates sessions.
**Changes**:
- `GET /auth`: Serve the auth page HTML
- `POST /auth`: Parse form body, proxy to API `POST /auth`, create server-side session, set `HttpOnly`, `Secure`, `SameSite=Lax` session cookie (`sid`), redirect to `/`
- `GET /logout`: Delete session, clear cookie, redirect to `/auth`
- Handle API errors (display error on auth page)

**Acceptance Criteria**:
- [ ] Auth page is served on GET /auth
- [ ] POST /auth creates session and sets cookie
- [ ] Cookie is HttpOnly, Secure, SameSite=Lax
- [ ] Logout clears session and cookie
- [ ] REQ-APP: Auth handler implements AC 1-4

---

### Task 8.6: Implement app server.ts

**File**: `demo/app/src/server.ts`
**Description**: Implement the dashboard app server with full route table, session middleware, and discovery headers.
**Changes**:
- Use `Bun.serve()` with route table:
  - `GET /` -> dashboard page (redirect to /auth if no session)
  - `GET /auth` -> auth page
  - `POST /auth` -> auth handler
  - `GET /logout` -> logout handler
  - `POST /api/call` -> proxy to API
  - `GET /catalog` -> catalog page
  - `GET /catalog/:id` -> item detail page
  - `GET /account` -> account page
  - `GET /reports` -> reports page
- Session middleware: check `sid` cookie, resolve session, redirect to /auth if invalid
- Add `X-AI-Instructions: https://agents.opencall-api.com/` header to all responses
- Add `<meta name="ai-instructions">` tag to all HTML pages
- Serve `GET /.well-known/ai-instructions` as redirect to agents URL
- Serve `GET /robots.txt` with agent instructions comment

**Acceptance Criteria**:
- [ ] All routes are correctly wired
- [ ] Session middleware protects authenticated routes
- [ ] Unauthenticated requests redirect to /auth
- [ ] Discovery headers are present on all responses
- [ ] REQ-APP: Server implements AC 1-16
- [ ] REQ-AGENTS: Discovery hints implement AC 4-7

---

## Phase 9: Frontend -- Atomic Design

> No TDD — HTML, CSS, and client-side JavaScript templates.

### Task 9.1: Implement atoms

**File**: `demo/app/public/app.css`
**Description**: Define CSS classes and HTML patterns for atomic UI primitives.
**Changes**:
- `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-danger` — button variants with consistent padding, border-radius, hover states
- `.input`, `.input-search` — text input styling with focus ring
- `.badge`, `.badge-overdue`, `.badge-available`, `.badge-pending` — colored pill badges
- `.code-block` — monospace pre-formatted block styling
- `.status-indicator`, `.status-complete`, `.status-pending`, `.status-error`, `.status-accepted` — colored dot + label

**Acceptance Criteria**:
- [ ] All atom CSS classes are defined with consistent design language
- [ ] Button variants have distinct visual styles
- [ ] Badge colors clearly communicate status
- [ ] REQ-APP: Atoms support the atomic design architecture

---

### Task 9.2: Implement molecules

**File**: `demo/app/public/app.css` (extend)
**Description**: Define CSS classes for molecule-level UI components.
**Changes**:
- `.filter-bar` — horizontal layout for search + filter + button
- `.card` — content card with title, metadata, badge, action button
- `.patron-badge` — card number in large monospace + username below, clickable
- `.scope-checkbox-group` — grouped checkboxes for scope selection

**Acceptance Criteria**:
- [ ] Molecules compose atoms into recognizable UI units
- [ ] Filter bar supports horizontal layout with responsive wrapping
- [ ] Patron badge displays card number prominently
- [ ] REQ-APP: Molecules support AC 13 (patron badge), AC 2 (scope checkboxes)

---

### Task 9.3: Implement organisms

**File**: `demo/app/public/app.css` (extend) + `demo/app/public/app.js` (partial)
**Description**: Define CSS and base JavaScript for complex organism-level UI sections.
**Changes**:
- `.envelope-viewer` — split-pane layout with request and response panes, syntax highlighting, collapse/expand, copy-to-clipboard
- `.catalog-list` — paginated card grid for catalog items
- `.item-detail` — full item display with cover image, metadata, availability
- `.overdue-list` — list of overdue items with return buttons
- `.report-progress` — async lifecycle display with status transitions

**Acceptance Criteria**:
- [ ] Envelope viewer supports split-pane display of request and response
- [ ] Catalog list supports pagination controls
- [ ] Report progress shows async lifecycle states
- [ ] REQ-APP: Organisms support AC 9-12 (envelope viewer), AC 15 (page components)

---

### Task 9.4: Implement templates

**File**: `demo/app/views/layout.html`
**Description**: Create HTML layout templates for the split-pane and auth page structures.
**Changes**:
- `split-pane-layout`: Left navigation sidebar, patron badge in top-left, content area (left pane for UI, right pane for envelope viewer), responsive collapse behavior
- `auth-layout`: Centered card layout without sidebar or envelope viewer
- Include `<meta name="ai-instructions" content="https://agents.opencall-api.com/" />` in `<head>`
- Include link to `app.css` and `app.js`

**Acceptance Criteria**:
- [ ] Split-pane layout has nav, patron badge, left/right panes
- [ ] Auth layout is centered card without sidebar
- [ ] AI instructions meta tag is present
- [ ] REQ-APP: Templates support AC 9, AC 13

---

### Task 9.5: Implement auth page

**File**: `demo/app/views/auth.html`
**Description**: Create the authentication page with username input, scope selection, and start button.
**Changes**:
- Username input field (pre-filled with generated adjective-animal name)
- Scope checkboxes with defaults checked (items:browse, items:read, items:write, patron:read, reports:generate)
- Items:manage and patron:billing checkboxes present but disabled with tooltip explaining they are never granted
- "Start Demo" button
- Optional "The demo has been reset" banner (shown via query parameter)

**Acceptance Criteria**:
- [ ] Username input with generated default
- [ ] All 7 scope checkboxes displayed, 2 disabled
- [ ] Start button submits form
- [ ] Reset banner conditionally displayed
- [ ] REQ-APP: Auth page implements AC 2, AC 7 (reset banner)

---

### Task 9.6: Implement dashboard, catalog, and item pages

**Files**: `demo/app/views/dashboard.html`, `demo/app/views/catalog.html`, `demo/app/views/item.html`
**Description**: Create the three main content pages using the split-pane layout template.
**Changes**:
- **dashboard.html**: Welcome message, quick links to catalog/account/reports, overdue warning banner (if patron has overdue items), agent instructions callout with link to agents.opencall-api.com
- **catalog.html**: Search field, type filter dropdown, availability toggle, paginated item cards (powered by `v1:catalog.list`), envelope viewer on right
- **item.html**: Item detail with cover image (demonstrates 303 redirect), metadata fields, availability badge, reserve button, envelope viewer showing `v1:item.get` and `v1:item.getMedia` exchanges

**Acceptance Criteria**:
- [ ] Dashboard shows overdue warning and quick links
- [ ] Catalog page has functional search, filter, and pagination
- [ ] Item page shows cover image and reserve button
- [ ] All pages include envelope viewer in right pane
- [ ] REQ-APP: Pages implement AC 15 (dashboard, catalog, item detail routes)

---

### Task 9.7: Implement account and report pages

**Files**: `demo/app/views/account.html`, `demo/app/views/report.html`
**Description**: Create the account management and report generation pages.
**Changes**:
- **account.html**: Patron card number display (large monospace), patron details via `v1:patron.get`, overdue items list with return buttons (powered by `v1:item.return`), lending history via `v1:patron.history`, envelope viewer
- **report.html**: Report generation form (format selector, item type filter, date range), generate button triggering `v1:report.generate`, async lifecycle display in envelope viewer (202 -> pending -> complete), download link on completion, chunk viewer demonstrating `GET /ops/{requestId}/chunks`

**Acceptance Criteria**:
- [ ] Account page shows patron details and overdue items with return buttons
- [ ] Report page supports format selection and date range
- [ ] Async lifecycle is displayed in the envelope viewer
- [ ] Chunk viewer shows individual chunks with checksums
- [ ] REQ-APP: Pages implement AC 15 (account, reports routes)

---

### Task 9.8: Implement client-side JavaScript

**File**: `demo/app/public/app.js`
**Description**: Implement client-side JavaScript for API interaction, envelope viewer rendering, and async polling.
**Changes**:
- `callApi(op, args)`: POST to `/api/call`, parse response, update envelope viewer
- Envelope viewer rendering: syntax-highlighted JSON, collapsible sections, copy-to-clipboard, elapsed time display
- Async polling UI: start polling on 202 response, update envelope viewer with each poll response, show download link on completion
- Filter/search handlers for catalog page
- Return button handlers for account page
- Report generation handlers with progress display
- Token masking in displayed envelopes

**Acceptance Criteria**:
- [ ] API calls go through the same-origin proxy at `/api/call`
- [ ] Envelope viewer renders both request and response with syntax highlighting
- [ ] Async polling updates the UI in real-time
- [ ] Copy-to-clipboard works for code blocks
- [ ] REQ-APP: Client JS supports AC 5 (same-origin calls), AC 9-12 (envelope viewer), AC 16 (scope error display)

---

## Phase 10: Brochure Site

> No TDD — static HTML and CSS.

### Task 10.1: Implement brochure HTML

**File**: `demo/www/index.html`
**Description**: Create the static brochure landing page for the OpenCALL protocol.
**Changes**:
- Hero section: XKCD 927 comic image (from `assets/xkcd-927.png`), linked to `https://xkcd.com/927/`, attribution to Randall Munroe / xkcd, tagline "Yes, we know. But hear us out.", descriptive paragraph, "Try the Demo" CTA button linking to `app.opencall-api.com`
- Content sections: "The Problem", "The Answer" (with `POST /call` code example), "Try It" (CTA + curl examples), "Compare" (summary comparison table), "Read the Spec" (link to GitHub specification), "Read the Client Guide" (link to GitHub client guide)
- Footer: GitHub repository link, "Built by one person" attribution, blog post link
- Dark mode toggle button

**Acceptance Criteria**:
- [ ] XKCD 927 is displayed with proper attribution and link
- [ ] All 6 content sections are present
- [ ] CTA button links to app.opencall-api.com
- [ ] Footer includes GitHub link and attribution
- [ ] Dark mode toggle is functional
- [ ] REQ-BROCHURE: Implements AC 1-2, AC 5-9

---

### Task 10.2: Implement brochure CSS

**File**: `demo/www/style.css`
**Description**: Style the brochure site with a clean, minimal design.
**Changes**:
- Clean typography with system fonts and monospace for code blocks
- Responsive layout (mobile-friendly)
- Dark mode support with CSS custom properties and cookie-persisted preference
- No purple gradients
- Code block styling with monospace fonts
- Comparison table styling
- Hero section layout with comic image

**Acceptance Criteria**:
- [ ] Design is clean and minimal
- [ ] No purple gradients
- [ ] Dark mode toggle persists preference via cookie
- [ ] Code blocks use monospace fonts
- [ ] Layout is responsive
- [ ] REQ-BROCHURE: Implements AC 3, AC 10-11

---

### Task 10.3: Firebase configuration for brochure site

**File**: `demo/www/firebase.json`
**Description**: Configure Firebase Hosting for the brochure site.
**Changes**:
- Set `hosting.site`: `"opencall-www"`
- Set `hosting.public`: `"."`
- Configure `Cache-Control: public, max-age=3600` headers
- Ignore `firebase.json` from deployment

**Acceptance Criteria**:
- [ ] Firebase hosting configuration is valid
- [ ] Cache headers are set
- [ ] REQ-BROCHURE: Implements AC 4

---

## Phase 11: Agent Instructions

> No TDD — static documentation and discovery configuration.

### Task 11.1: Write agent instructions

**File**: `demo/agents/index.md`
**Description**: Create the comprehensive agent instructions document for AI agent interaction with the library API.
**Changes**:
- Authentication flow section: explain that agents should ask the user for their library card number, then call `POST /auth/agent` with the card number
- Available operations section: list all 11 operations with brief descriptions, args, and scopes
- Common workflow section: step-by-step example (authenticate -> browse catalog -> check patron -> return overdue -> reserve item -> generate report)
- Domain error handling section: explain how to interpret `state=error` responses, common error codes, and recovery strategies
- Scope limitations section: explain that `items:manage` and `patron:billing` are never granted

**Acceptance Criteria**:
- [ ] Document covers auth flow, operations, workflows, and error handling
- [ ] Card number format is documented (XXXX-XXXX-XX)
- [ ] Common workflow is a clear step-by-step guide
- [ ] REQ-AGENTS: Implements AC 1-2

---

### Task 11.2: Firebase configuration and discovery hints

**Files**: `demo/agents/firebase.json`, updates to `demo/app/src/server.ts`
**Description**: Configure Firebase Hosting for agent instructions and add discovery mechanisms to the app.
**Changes**:
- **firebase.json**: Set `hosting.site`: `"opencall-agents"`, configure `Content-Type: text/markdown; charset=utf-8` header for `.md` files, set cache headers
- **App discovery hints** (in `demo/app/src/server.ts`, already partially covered in Task 8.6):
  - Verify `<meta name="ai-instructions" content="https://agents.opencall-api.com/" />` in all HTML pages
  - Verify `X-AI-Instructions` response header on all responses
  - Verify `GET /.well-known/ai-instructions` redirects to agents URL
  - Verify `robots.txt` includes agent instructions comment

**Acceptance Criteria**:
- [ ] Firebase config serves markdown with correct content type
- [ ] All 4 discovery hints are in place (meta tag, header, .well-known redirect, robots.txt)
- [ ] REQ-AGENTS: Implements AC 3-7

---

## Phase 12: Analytics

> TDD — write tests before implementation.

### Task 12.1: Write analytics tests

**File**: `demo/api/tests/analytics.test.ts`
**Description**: Write test cases for the visitor and agent analytics tracking system.
**Test Cases**:
- Visitor record is upserted on `POST /auth` (matching on IP + User-Agent)
- Agent record is linked to visitor on `POST /auth/agent` (via cardNumber lookup)
- `pageViews` counter increments on page requests
- `apiCalls` counter increments for demo token API calls
- `apiCalls` counter increments for agent token API calls
- Analytics tables survive database reset (data persists)

**Acceptance Criteria**:
- [ ] All 6 test cases are defined and initially fail
- [ ] Tests validate fire-and-forget behavior does not block primary requests
- [ ] REQ-ANALYTICS: Tests cover AC 1-7

---

### Task 12.2: Implement analytics service

**File**: `demo/api/src/services/analytics.ts`
**Description**: Implement fire-and-forget visitor and agent tracking functions.
**Changes**:
- `upsertVisitor(data)`: Match on `(ip, user_agent)`, upsert `analytics_visitors` row, return visitor ID
- `linkAgent(cardNumber, data)`: Look up visitor by card number, insert `analytics_agents` row with `visitor_id` FK
- `incrementPageViews(visitorId)`: Fire-and-forget update of `page_views` counter
- `incrementApiCalls(tokenType, analyticsId)`: Fire-and-forget update of `api_calls` counter on the appropriate table (visitors for demo tokens, agents for agent tokens)
- All analytics functions use fire-and-forget pattern (errors are logged but do not propagate)

**Acceptance Criteria**:
- [ ] All analytics tests from Task 12.1 pass
- [ ] Visitor deduplication works via IP + User-Agent matching
- [ ] Agent records link to visitor records via cardNumber
- [ ] Counter increments are fire-and-forget
- [ ] REQ-ANALYTICS: Implements AC 1-9

---

## Phase 13: Integration Tests

> TDD — comprehensive end-to-end test suites.

### Task 13.1: Write API integration tests

**File**: `demo/api/tests/integration.test.ts`
**Description**: Write an end-to-end test suite that exercises the complete demo narrative through the API.
**Test Cases**:
- Full narrative flow: authenticate -> browse catalog (v1:catalog.list) -> get item (v1:item.get) -> try reserve (OVERDUE_ITEMS_EXIST) -> get patron (v1:patron.get, verify overdues) -> return overdue items (v1:item.return) -> reserve successfully (v1:item.reserve) -> generate report (v1:report.generate) -> poll until complete -> get chunks (verify checksum chain)
- Scope enforcement: authenticate with limited scopes, verify 403 on unauthorized operations
- Deprecated operation: call v1:catalog.listLegacy, verify it works and returns same results as v1:catalog.list
- Error handling: verify all domain errors (ITEM_NOT_FOUND, ITEM_NOT_CHECKED_OUT, ITEM_NOT_AVAILABLE, ALREADY_RESERVED)

**Acceptance Criteria**:
- [ ] Full narrative test passes end-to-end
- [ ] Scope enforcement test covers at least patron.fines and catalog.bulkImport
- [ ] Deprecation test verifies both pre-sunset behavior and registry metadata
- [ ] All domain error scenarios are exercised
- [ ] REQ-SPEC through REQ-CHUNKS: All API requirements verified in integration

---

### Task 13.2: Write app integration tests

**File**: `demo/app/tests/integration.test.ts`
**Description**: Write integration tests for the dashboard app server.
**Test Cases**:
- Auth flow: GET /auth returns HTML, POST /auth creates session and redirects, session cookie is set correctly
- Proxy: POST /api/call with valid session forwards to API and returns envelope viewer metadata
- Session: invalid/expired session redirects to /auth
- Logout: GET /logout clears session and cookie, redirects to /auth

**Acceptance Criteria**:
- [ ] All 4 test scenarios pass
- [ ] Tests exercise the full app auth + proxy lifecycle
- [ ] REQ-APP: Integration tests verify AC 1-8

---

### Task 13.3: Write agent workflow test

**File**: `demo/api/tests/agent.test.ts`
**Description**: Write an end-to-end test simulating an AI agent interacting with the library API.
**Test Cases**:
- Agent auth: POST /auth/agent with valid card number returns agent token with fixed scopes
- Agent workflow: authenticate -> browse catalog -> get patron data -> return overdue items -> reserve item
- Agent scope limits: agent cannot generate reports (missing reports:generate scope)

**Acceptance Criteria**:
- [ ] Agent auth test passes with correct token format and scopes
- [ ] Full agent workflow test passes end-to-end
- [ ] Agent scope limitation is verified (403 for report generation)
- [ ] REQ-AGENTS: Agent workflow verified
- [ ] REQ-AUTH: Agent auth flow verified (AC 10-16)

---

## Phase 14: Deployment

> No TDD — infrastructure and deployment configuration.

### Task 14.1: Create API Dockerfile

**File**: `demo/api/Dockerfile`
**Description**: Create the Docker configuration for the API server.
**Changes**:
- Base image: `oven/bun:latest`
- WORKDIR `/app`
- COPY `package.json` and `bun.lock*`, RUN `bun install --frozen-lockfile --production`
- COPY remaining source files
- EXPOSE 8080
- CMD `["bun", "run", "src/server.ts"]`

**Acceptance Criteria**:
- [ ] Docker build succeeds
- [ ] Container starts and serves on port 8080
- [ ] REQ-SPEC: API is deployable as a container

---

### Task 14.2: Create App Dockerfile

**File**: `demo/app/Dockerfile`
**Description**: Create the Docker configuration for the dashboard app server.
**Changes**:
- Base image: `oven/bun:latest`
- WORKDIR `/app`
- COPY `package.json` and `bun.lock*`, RUN `bun install --frozen-lockfile --production`
- COPY remaining source files
- EXPOSE 8080
- CMD `["bun", "run", "src/server.ts"]`

**Acceptance Criteria**:
- [ ] Docker build succeeds
- [ ] Container starts and serves on port 8080
- [ ] REQ-APP: App is deployable as a container

---

### Task 14.3: Create deploy scripts

**File**: `demo/scripts/deploy.sh`
**Description**: Create deployment scripts for Cloud Run services and Firebase Hosting sites.
**Changes**:
- Cloud Run deploy commands for API service (`api.opencall-api.com`)
- Cloud Run deploy commands for App service (`app.opencall-api.com`)
- Firebase deploy command for brochure site (`www.opencall-api.com`)
- Firebase deploy command for agent instructions (`agents.opencall-api.com`)
- Environment variable configuration for each service

**Acceptance Criteria**:
- [ ] Deploy script covers all 4 subdomains
- [ ] Environment variables are documented in the script
- [ ] REQ-SPEC: Deployment supports the multi-subdomain architecture

---

### Task 14.4: Document environment variables

**File**: `demo/docs/env-vars.md`
**Description**: Document all required and optional environment variables for both services.
**Changes**:
- **API service variables**: `PORT` (optional, default 8080), `DATABASE_PATH` (optional, default `./library.db`), `GCS_BUCKET` (required), `GCS_PROJECT_ID` (required), `ADMIN_SECRET` (required), `CALL_VERSION` (optional, default `"2026-02-10"`)
- **App service variables**: `PORT` (optional, default 8080), `API_URL` (required), `SESSION_DB_PATH` (optional, default `./sessions.db`), `COOKIE_SECRET` (required), `AGENTS_URL` (optional, default `https://agents.opencall-api.com`)

**Acceptance Criteria**:
- [ ] All environment variables are documented with descriptions, required/optional status, and defaults
- [ ] REQ-SPEC: Environment configuration is fully documented

---

### Task 14.5: Configure Cloud Scheduler for periodic reset

**File**: `demo/scripts/setup-scheduler.sh`
**Description**: Create a script to configure Cloud Scheduler for the 4-hour database reset cycle.
**Changes**:
- Create Cloud Scheduler job with cron expression `0 */4 * * *` (every 4 hours)
- Target: `POST https://api.opencall-api.com/admin/reset`
- Auth header: `Authorization: Bearer {ADMIN_SECRET}`
- Retry config: 1 retry with 60-second backoff
- Include instructions for manual reset trigger

**Acceptance Criteria**:
- [ ] Scheduler job configuration is correct
- [ ] Target URL and auth are properly configured
- [ ] Retry policy is set
- [ ] REQ-RESET: Implements AC 1 (4-hour automatic reset)

---

## Task Dependency Graph

```
Phase 1 (Scaffolding)
├──► Phase 2 (API Core Infrastructure)
│    └──► Phase 4 (Sync Operations) ◄── Phase 3 (Registry)
│         └──► Phase 5 (Async Operations + XState)
│              └──► Phase 6 (Seed Data)
│                   └──► Phase 7 (API Server Entry Point)
│                        ├──► Phase 8 (App Server)
│                        │    └──► Phase 9 (Frontend)
│                        │         └──► Phase 13 (Integration Tests) ◄── Phase 12
│                        │              └──► Phase 14 (Deployment)
│                        └──► Phase 12 (Analytics)
├──► Phase 10 (Brochure Site) [independent, can parallel after Phase 1]
└──► Phase 11 (Agent Instructions) [independent, can parallel after Phase 1]
```

### Phase 4 Internal TDD Cycle

For each synchronous operation in Phase 4, tasks follow this dependency pattern:

```
Test Task (e.g., 4.1) ──► Operation Task (e.g., 4.2) ──► Service Task (e.g., 4.3)
```

The test is written first, the operation module (schemas + JSDoc + handler) is implemented second, and the service layer (database queries) is implemented third. This ensures the test defines the expected behavior before any implementation begins.

### Full Dependency Edges

| From | To | Reason |
|------|-----|--------|
| Phase 1 | Phase 2 | Core infra needs package.json, tsconfig, DB schema, envelope types |
| Phase 1 | Phase 3 | Registry needs project structure and type definitions |
| Phase 1 | Phase 10 | Brochure site needs project directory structure only |
| Phase 1 | Phase 11 | Agent instructions needs project directory structure only |
| Phase 2 | Phase 4 | Sync ops need dispatcher, auth middleware, and scope enforcement |
| Phase 3 | Phase 4 | Sync ops need registry for JSDoc-based metadata and schema generation |
| Phase 4 | Phase 5 | Async ops build on sync infrastructure and add XState lifecycle |
| Phase 5 | Phase 6 | Seed data requires all operation schemas to be defined for data generation |
| Phase 6 | Phase 7 | Server entry point requires seed data to be loadable at startup |
| Phase 7 | Phase 8 | App server proxies to the API server and needs it running |
| Phase 7 | Phase 12 | Analytics integrates with auth and call endpoints |
| Phase 8 | Phase 9 | Frontend pages require app server routes and proxy |
| Phase 9 | Phase 13 | Integration tests require all frontend and backend to be wired |
| Phase 12 | Phase 13 | Integration tests verify analytics behavior survives reset |
| Phase 13 | Phase 14 | Deployment occurs after all tests pass |

---

## Task Summary

| Phase | Task | Description |
|-------|------|-------------|
| 1 | 1.1 | API package.json with dependencies and scripts |
| 1 | 1.2 | API tsconfig.json for Bun environment |
| 1 | 1.3 | App package.json with minimal dependencies |
| 1 | 1.4 | App tsconfig.json for Bun environment |
| 1 | 1.5 | SQLite DDL schemas (8 API tables + 1 app table + indexes) |
| 1 | 1.6 | Database connection module using bun:sqlite |
| 1 | 1.7 | Shared types: envelope Zod schemas + error constructors |
| 2 | 2.1 | Write dispatcher tests (envelope shape, errors, 405) |
| 2 | 2.2 | Implement dispatcher (parse, validate, route) |
| 2 | 2.3 | Write auth tests (human auth, agent auth, token validation) |
| 2 | 2.4 | Implement tokens module (mint, store, lookup, expiry) |
| 2 | 2.5 | Implement scopes module (definitions, mapping, defaults) |
| 2 | 2.6 | Implement auth middleware (Bearer extraction, scope enforcement) |
| 3 | 3.1 | Write registry tests (endpoint, fields, caching, 304) |
| 3 | 3.2 | Implement JSDoc parser (tag extraction and mapping) |
| 3 | 3.3 | Implement registry builder and GET handler (boot-time scan, ETag) |
| 4 | 4.1 | Write catalog.list tests (shape, filters, pagination) |
| 4 | 4.2 | Implement catalog.list operation (schemas, JSDoc, handler) |
| 4 | 4.3 | Implement catalog service (SQLite queries, filtering) |
| 4 | 4.4 | Write catalog.listLegacy tests (equivalence, deprecation) |
| 4 | 4.5 | Implement catalog.listLegacy operation (deprecated, sunset) |
| 4 | 4.6 | Write item.get tests (success, ITEM_NOT_FOUND) |
| 4 | 4.7 | Implement item.get operation (schemas, handler) |
| 4 | 4.8 | Write item.getMedia tests (303 redirect, placeholder, not found) |
| 4 | 4.9 | Implement item.getMedia operation + media service (GCS URLs) |
| 4 | 4.10 | Write item.return tests (success, overdue, errors, availability) |
| 4 | 4.11 | Implement item.return operation (schemas, handler) |
| 4 | 4.12 | Implement lending service (return, overdue check, availability) |
| 4 | 4.13 | Write item.reserve tests (success, OVERDUE_ITEMS_EXIST, errors) |
| 4 | 4.14 | Implement item.reserve operation (overdue check, reservation) |
| 4 | 4.15 | Write patron.get tests (data shape, overdue guarantee) |
| 4 | 4.16 | Implement patron.get operation (patron data aggregation) |
| 4 | 4.17 | Write patron.history tests (pagination, status filter) |
| 4 | 4.18 | Implement patron.history operation (filtered lending query) |
| 4 | 4.19 | Implement patron.fines operation (always 403, scope demo) |
| 5 | 5.1 | Write XState lifecycle tests (transitions, persistence) |
| 5 | 5.2 | Implement XState machine + lifecycle service (state machine, SQLite) |
| 5 | 5.3 | Write polling handler tests (state, 404, 429) |
| 5 | 5.4 | Implement polling handler (status lookup, rate limiting) |
| 5 | 5.5 | Write chunk handler tests (pagination, checksums, size) |
| 5 | 5.6 | Implement chunk handler (slicing, SHA-256 chain, cursor) |
| 5 | 5.7 | Write report.generate tests (202, polling lifecycle, chunks) |
| 5 | 5.8 | Implement report.generate operation + reports service (async gen) |
| 5 | 5.9 | Implement catalog.bulkImport operation (always 403, scope demo) |
| 6 | 6.1 | Implement seed script (Open Library data, faker, lending history) |
| 6 | 6.2 | Download cover images (Open Library Covers API, GCS upload) |
| 6 | 6.3 | Implement reset script (selective wipe, preserve seed + analytics) |
| 7 | 7.1 | Write error handling tests (all protocol + domain error codes) |
| 7 | 7.2 | Implement server.ts (Bun.serve, route table, boot-time init) |
| 7 | 7.3 | Wire all handlers and verify all tests pass |
| 8 | 8.1 | Write session store tests (CRUD, expiry) |
| 8 | 8.2 | Implement session store (SQLite sessions, expiry check) |
| 8 | 8.3 | Write proxy tests (forwarding, metadata, token masking) |
| 8 | 8.4 | Implement proxy module (forward to API, enrich response) |
| 8 | 8.5 | Implement auth handler (page serving, session creation, logout) |
| 8 | 8.6 | Implement app server.ts (routes, session middleware, discovery) |
| 9 | 9.1 | Implement atoms (button, input, badge, code-block, status) |
| 9 | 9.2 | Implement molecules (filter-bar, card, patron-badge, scopes) |
| 9 | 9.3 | Implement organisms (envelope-viewer, catalog-list, item-detail) |
| 9 | 9.4 | Implement templates (split-pane-layout, auth-layout) |
| 9 | 9.5 | Implement auth page (username, scopes, start button) |
| 9 | 9.6 | Implement dashboard, catalog, and item pages |
| 9 | 9.7 | Implement account and report pages |
| 9 | 9.8 | Implement client-side JavaScript (API calls, viewer, polling) |
| 10 | 10.1 | Implement brochure HTML (hero, sections, footer, dark toggle) |
| 10 | 10.2 | Implement brochure CSS (clean, minimal, dark mode, no purple) |
| 10 | 10.3 | Firebase configuration for brochure site |
| 11 | 11.1 | Write agent instructions (auth, operations, workflows, errors) |
| 11 | 11.2 | Firebase config + discovery hints (meta, header, .well-known) |
| 12 | 12.1 | Write analytics tests (upsert, linking, counters, reset survival) |
| 12 | 12.2 | Implement analytics service (fire-and-forget tracking) |
| 13 | 13.1 | Write API integration tests (full demo narrative end-to-end) |
| 13 | 13.2 | Write app integration tests (auth, proxy, session, logout) |
| 13 | 13.3 | Write agent workflow test (agent auth, browse, return, reserve) |
| 14 | 14.1 | API Dockerfile (oven/bun, install, expose 8080) |
| 14 | 14.2 | App Dockerfile (oven/bun, install, expose 8080) |
| 14 | 14.3 | Deploy scripts (Cloud Run + Firebase for all 4 subdomains) |
| 14 | 14.4 | Environment variable documentation |
| 14 | 14.5 | Cloud Scheduler configuration (4-hour reset cycle) |
