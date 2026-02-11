# Implementation Tasks

## Overview

This document outlines the implementation tasks for the OpenCALL todo example API and test suite. Tasks follow TDD ordering: test infrastructure and tests are written before the API implementation.

## Prerequisites

- [ ] Review and approve requirements.md
- [ ] Review and approve design.md
- [ ] Bun runtime installed

---

## Phase 1: Project Scaffolding

### Task 1.1: Create test project package.json

**File**: `tests/package.json`

**Description**: Create the test project with only test dependencies (`@types/bun`). Includes `pretest` script to install API deps.

**Acceptance Criteria**:

- [ ] `bun install` in `tests/` installs only test dependencies
- [ ] `pretest` script runs `cd api/typescript && bun install`

---

### Task 1.2: Create test project tsconfig and bunfig

**Files**: `tests/tsconfig.json`, `tests/bunfig.toml`

**Description**: Configure TypeScript for ESNext + bundler resolution with `noEmit: true`. Configure bunfig to preload `./helpers/setup.ts`.

**Acceptance Criteria**:

- [ ] TypeScript configured for Bun environment
- [ ] bunfig preloads setup.ts for test lifecycle

---

### Task 1.3: Create API project scaffolding

**Files**: `tests/api/typescript/package.json`, `tests/api/typescript/tsconfig.json`

**Description**: Create the TypeScript API project with `zod` and `zod-to-json-schema` dependencies.

**Acceptance Criteria**:

- [ ] `bun install` in `tests/api/typescript/` installs zod and zod-to-json-schema
- [ ] TypeScript configured for Bun environment

---

## Phase 2: Test Infrastructure (TDD — Tests First)

### Task 2.1: Write test helper client

**File**: `tests/helpers/client.ts`

**Description**: HTTP client helpers for test suite. Exports `call()`, `getRegistry()`, `waitForServer()`.

**Acceptance Criteria**:

- [ ] `call(op, args, ctx?)` sends POST /call and returns `{ status, body }`
- [ ] `getRegistry()` sends GET /.well-known/ops and returns `{ status, body, headers }`
- [ ] `waitForServer()` polls until server responds
- [ ] Uses `API_URL` env var, defaults to `http://localhost:3000`

---

### Task 2.2: Write test fixtures

**File**: `tests/helpers/fixtures.ts`

**Description**: Todo fixture factories for test data.

**Acceptance Criteria**:

- [ ] `validTodo(overrides?)` returns full todo args with unique title
- [ ] `minimalTodo(overrides?)` returns title-only args

---

### Task 2.3: Write test server lifecycle helpers

**Files**: `tests/helpers/server.ts`, `tests/helpers/setup.ts`

**Description**: Server start/stop lifecycle and bunfig preload setup.

**Acceptance Criteria**:

- [ ] `startServer()` dynamically imports API and starts server
- [ ] `stopServer()` stops the server
- [ ] `setup.ts` starts server in beforeAll if API_URL not set
- [ ] `setup.ts` stops server in afterAll

---

## Phase 3: Test Suite (TDD — Tests First)

### Task 3.1: Write self-description tests

**File**: `tests/self-description.test.ts`

**Description**: Tests for REQ-SELF requirements — registry endpoint validation.

**Test Cases**:

1. Returns 200 with application/json
2. callVersion is a date string
3. All 6 todo ops present
4. Each op has required registry fields
5. argsSchema is JSON Schema with type: "object"
6. Side-effecting ops declare idempotencyRequired
7. v1:todos.create requires title
8. All ops use sync execution model
9. Response includes caching headers

**Acceptance Criteria**:

- [ ] All tests written and runnable
- [ ] Tests fail (no server yet — TDD red phase)

---

### Task 3.2: Write envelope tests

**File**: `tests/envelope.test.ts`

**Description**: Tests for REQ-ENV requirements — response envelope shape.

**Test Cases**:

1. requestId echoed from request
2. requestId always present even if not provided
3. sessionId echoed when provided
4. state=complete has result, no error
5. state=error has error, no result
6. result and error mutually exclusive

**Acceptance Criteria**:

- [ ] All tests written and runnable
- [ ] Tests fail (TDD red phase)

---

### Task 3.3: Write CRUD tests

**File**: `tests/crud.test.ts`

**Description**: Tests for REQ-CRUD requirements — full todo CRUD operations.

**Test Cases**:

1. Create with all fields
2. Create with minimal fields
3. Get by id
4. Get nonexistent returns TODO_NOT_FOUND
5. List returns items/cursor/total
6. List with limit
7. List with completed filter
8. List with label filter
9. List with cursor pagination
10. Update title
11. Update partial preserves other fields
12. Update changes updatedAt
13. Update nonexistent returns error
14. Delete existing todo
15. Delete nonexistent returns error
16. Complete marks todo complete
17. Complete is idempotent
18. Complete nonexistent returns error

**Acceptance Criteria**:

- [ ] All tests written and runnable
- [ ] Tests fail (TDD red phase)

---

### Task 3.4: Write error handling tests

**File**: `tests/errors.test.ts`

**Description**: Tests for REQ-ERR requirements — error classification.

**Test Cases**:

1. Unknown op returns 400 + UNKNOWN_OP
2. Missing op field returns 400
3. Missing required arg returns 400 + VALIDATION_ERROR
4. Wrong arg type returns 400 + VALIDATION_ERROR
5. Domain error returns 200 + state=error
6. Error has code + message
7. Invalid JSON returns 400

**Acceptance Criteria**:

- [ ] All tests written and runnable
- [ ] Tests fail (TDD red phase)

---

### Task 3.5: Write idempotency tests

**File**: `tests/idempotency.test.ts`

**Description**: Tests for REQ-IDEM requirements — idempotency key handling.

**Test Cases**:

1. Same key returns same result, no duplicate
2. Different key creates different todos
3. No key allows duplicates
4. Non-side-effecting ops ignore key

**Acceptance Criteria**:

- [ ] All tests written and runnable
- [ ] Tests fail (TDD red phase)

---

## Phase 4: TypeScript API Implementation

### Task 4.1: Implement Zod schemas

**File**: `tests/api/typescript/src/schemas.ts`

**Description**: Define all Zod schemas for operation args and results.

**Acceptance Criteria**:

- [ ] All schemas defined per design document
- [ ] TypeScript compiles without errors

---

### Task 4.2: Implement operation handlers

**File**: `tests/api/typescript/src/operations.ts`

**Description**: In-memory storage and handler functions for all 6 todo operations.

**Acceptance Criteria**:

- [ ] All handlers return `{ ok, result }` or `{ ok, error }`
- [ ] OPERATIONS registry maps op names to handlers
- [ ] resetStorage() clears both stores

---

### Task 4.3: Implement registry builder

**File**: `tests/api/typescript/src/registry.ts`

**Description**: Build /.well-known/ops response from Zod schemas using zod-to-json-schema.

**Acceptance Criteria**:

- [ ] Registry includes all 6 operations with correct metadata
- [ ] JSON Schema generated from Zod schemas

---

### Task 4.4: Implement router

**File**: `tests/api/typescript/src/router.ts`

**Description**: Request envelope parsing, operation dispatch, error classification.

**Acceptance Criteria**:

- [ ] Dispatches to correct handler based on op name
- [ ] Error classification follows spec (400 for protocol, 200 for domain)
- [ ] Idempotency checking for side-effecting ops

---

### Task 4.5: Implement server entry point

**File**: `tests/api/typescript/src/index.ts`

**Description**: Bun.serve() with createServer() factory export.

**Acceptance Criteria**:

- [ ] createServer(port) starts server and returns Server
- [ ] Registry endpoint with ETag and Cache-Control
- [ ] POST /call dispatches to router
- [ ] All tests pass (TDD green phase)

---

## Phase 5: Docker Support

### Task 5.1: Create Dockerfile and docker-compose

**Files**: `tests/api/typescript/Dockerfile`, `tests/docker/docker-compose.yml`, `tests/docker/.env.example`

**Description**: Docker support for running the API in a container and testing against it.

**Acceptance Criteria**:

- [ ] `docker compose up --build` starts the API
- [ ] `API_URL=http://localhost:3000 bun test` passes against container

---

## Phase 6: Documentation

### Task 6.1: Update README and add tests README

**Files**: `README.md`, `tests/README.md`

**Description**: Add example implementations section to main README. Create tests README with usage guide.

**Acceptance Criteria**:

- [ ] Main README links to tests/
- [ ] Tests README covers running tests, folder structure, adding new languages
