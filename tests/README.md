# OpenCALL Example APIs & Test Suite

Language-agnostic test suite for validating OpenCALL API implementations, plus reference implementations in multiple languages.

## Quick Start

```bash
# Install test deps and run tests against the TypeScript API (in-process)
bun install && bun test
```

## How It Works

The test suite communicates with any OpenCALL-compliant API via HTTP. By default, it starts the TypeScript API in-process for fast TDD cycles. Set `API_URL` to test against any running server.

### In-Process Testing (default)

Tests import the TypeScript API's `createServer()` function, start it in `beforeAll`, and stop it in `afterAll`. No external process needed.

### External Server Testing

```bash
# Start any OpenCALL-compliant server, then:
API_URL=http://localhost:3000 bun test
```

The test setup automatically waits for the server, registers an auth token via `POST /_internal/tokens`, and runs all tests.

### Docker Testing (all four languages)

```bash
docker compose -f docker/docker-compose.yml up --build -d

# Test any implementation — setup auto-registers auth tokens
API_URL=http://localhost:3001 bun test  # TypeScript
API_URL=http://localhost:3002 bun test  # Python
API_URL=http://localhost:3003 bun test  # Java
API_URL=http://localhost:3004 bun test  # Go
```

| Service | Port | Language | Framework |
|---------|------|----------|-----------|
| todo-typescript | 3001 | TypeScript | Bun |
| todo-python | 3002 | Python | FastAPI |
| todo-java | 3003 | Java | Javalin |
| todo-go | 3004 | Go | Gin |

### A note on performance differences

You'll notice Go and TypeScript complete the test suite ~25% faster than Python and Java. This is not a language benchmark and should not be read as one. The implementations are intentionally naive — in-memory stores, no connection pooling, no optimization — to keep the code readable and focused on the OpenCALL contract.

The timing gap comes from specific implementation choices, not inherent language limitations:

- **Async timer overhead.** The async tests (export, report generation) use nested timers. Go uses `time.AfterFunc` (goroutine, near-zero cost). Bun uses native `setTimeout`. Python uses `threading.Timer` (spawns an OS thread per timer), and Java uses `java.util.Timer` (creates a background thread per instance). With 10+ async tests doing nested timers, thread-creation overhead accumulates.
- **JVM cold start.** Java's Docker healthcheck includes a 10-second `start_period` that the others don't need. This doesn't affect test execution time, but it's visible in Docker startup.
- **Registry serialization.** Go and TypeScript pre-serialize the registry JSON once at startup and return raw bytes. Python and Java re-process responses through their framework's serialization pipeline per request.

A production Python API using `asyncio` tasks instead of `threading.Timer`, or a Java API using `ScheduledExecutorService` instead of `java.util.Timer`, would close most of this gap. These reference implementations prioritize clarity over performance.

### Python API

```bash
cd api/python
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 3002 &

API_URL=http://localhost:3002 bun test
```

### Java API

```bash
cd api/java
gradle shadowJar --no-daemon
java -jar build/libs/app.jar &  # starts on port 3000

API_URL=http://localhost:3000 bun test
```

### Go API

```bash
cd api/go
go build -o server . && ./server &  # starts on port 3000

API_URL=http://localhost:3000 bun test
```

## Test Coverage

112 tests across 13 files covering the full OpenCALL specification:

| File | Tests | Area |
|------|-------|------|
| `self-description.test.ts` | 13 | Registry endpoint, caching, metadata |
| `envelope.test.ts` | 6 | Response envelope format |
| `crud.test.ts` | 15+ | Create, read, list, update, delete, complete |
| `errors.test.ts` | 7 | Protocol and domain error handling |
| `idempotency.test.ts` | 4 | Idempotency key deduplication |
| `auth.test.ts` | 10 | Auth 401/403, scopes |
| `async.test.ts` | 10 | HTTP 202, polling, state transitions |
| `deprecated.test.ts` | 7 | HTTP 410, sunset dates, replacements |
| `status-codes.test.ts` | 7 | HTTP 500/502/503/404 |
| `evolution.test.ts` | 5 | Schema robustness principle |
| `chunked.test.ts` | 8 | Chunked retrieval with SHA-256 |
| `media.test.ts` | 9 | Multipart upload, 303 redirect |
| `streaming.test.ts` | 8 | WebSocket streaming |

## Operations

| Operation | Model | Auth | Description |
|-----------|-------|------|-------------|
| `v1:todos.create` | sync | `todos:write` | Create a todo |
| `v1:todos.get` | sync | `todos:read` | Get a todo by ID |
| `v1:todos.list` | sync | `todos:read` | List todos with filters and pagination |
| `v1:todos.update` | sync | `todos:write` | Partial update a todo |
| `v1:todos.delete` | sync | `todos:write` | Delete a todo |
| `v1:todos.complete` | sync | `todos:write` | Mark a todo complete (idempotent) |
| `v1:todos.export` | async | `todos:read` | Export todos as CSV/JSON |
| `v1:reports.generate` | async | `reports:read` | Generate a summary report |
| `v1:todos.search` | sync | `todos:read` | Search (deprecated, returns 410) |
| `v1:todos.attach` | sync | `todos:write` | Attach media to a todo |
| `v1:todos.watch` | stream | `todos:read` | Watch for changes via WebSocket |
| `v1:debug.simulateError` | sync | none | Simulate error status codes |

## Folder Structure

```
tests/
├── package.json              # Test deps only
├── bunfig.toml               # Preloads server lifecycle
├── helpers/                  # Shared test infrastructure
│   ├── client.ts             # HTTP client (call, getRegistry)
│   ├── auth.ts               # Auth helpers (callWithAuth, callWithoutAuth)
│   ├── async.ts              # Async helpers (pollOperation, waitForCompletion)
│   ├── fixtures.ts           # Todo factories
│   ├── server.ts             # Start/stop server
│   └── setup.ts              # beforeAll/afterAll + master token
├── self-description.test.ts  # Registry endpoint tests
├── envelope.test.ts          # Response envelope tests
├── crud.test.ts              # CRUD operation tests
├── errors.test.ts            # Error handling tests
├── idempotency.test.ts       # Idempotency key tests
├── auth.test.ts              # Auth 401/403 tests
├── async.test.ts             # Async 202/polling tests
├── deprecated.test.ts        # Deprecated ops / 410 tests
├── status-codes.test.ts      # Status code tests
├── evolution.test.ts         # Schema evolution tests
├── chunked.test.ts           # Chunked retrieval tests
├── media.test.ts             # Media upload/egress tests
├── streaming.test.ts         # WebSocket streaming tests
├── specs/                    # Kiro-format specifications
├── api/
│   ├── typescript/           # Reference TypeScript implementation (Bun)
│   │   ├── package.json
│   │   └── src/
│   │       ├── index.ts      # Server entry + createServer() + routes
│   │       ├── schemas.ts    # Zod schemas (single source of truth)
│   │       ├── operations.ts # Handlers + in-memory store
│   │       ├── registry.ts   # /.well-known/ops builder
│   │       ├── router.ts     # POST /call dispatcher
│   │       ├── auth.ts       # Token validation
│   │       ├── state.ts      # Async operation state machine
│   │       └── media.ts      # Media blob storage
│   ├── python/               # Python implementation (FastAPI)
│   │   ├── requirements.txt
│   │   ├── Dockerfile
│   │   └── app/
│   │       ├── main.py       # FastAPI app + routes
│   │       ├── schemas.py    # Type hints
│   │       ├── operations.py # Handlers + in-memory store
│   │       ├── registry.py   # Registry builder
│   │       ├── router.py     # Envelope dispatch
│   │       ├── auth.py       # Token validation
│   │       ├── state.py      # Async state machine
│   │       └── media.py      # Media storage
│   ├── java/                 # Java implementation (Javalin)
│   │   ├── build.gradle
│   │   ├── Dockerfile
│   │   └── src/main/java/opencall/
│   │       ├── App.java      # Javalin server + routes
│   │       ├── Operations.java # Handlers + in-memory store
│   │       ├── Registry.java # Registry builder
│   │       ├── Router.java   # Envelope dispatch
│   │       ├── Auth.java     # Token validation
│   │       ├── State.java    # Async state machine
│   │       └── Media.java    # Media storage
│   └── go/                   # Go implementation (Gin)
│       ├── go.mod
│       ├── Dockerfile
│       ├── main.go           # Gin server + routes
│       ├── operations.go     # Handlers + in-memory store
│       ├── registry.go       # Registry builder
│       ├── router.go         # Envelope dispatch
│       ├── auth.go           # Token validation
│       ├── state.go          # Async state machine
│       └── media.go          # Media storage
└── docker/
    └── docker-compose.yml
```

## Adding a New Language Implementation

1. Create `api/<language>/` with the API implementation
2. The API must implement:
   - `GET /.well-known/ops` — return the operation registry
   - `POST /call` — accept the OpenCALL envelope and dispatch operations
   - `GET /ops/{requestId}` — poll async operation state
   - `GET /ops/{requestId}/chunks` — chunked retrieval
   - `GET /media/{id}` — media egress (303 redirect)
   - `WebSocket /streams/{sessionId}` — streaming
   - `POST /_internal/tokens` — register auth tokens (test helper)
3. Start the server and run: `API_URL=http://localhost:<port> bun test` (setup auto-registers auth tokens)
4. All 112 tests should pass — the same contract applies to every implementation

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `API_URL` | `http://localhost:3000` | URL of the API server to test against |
| `AUTH_TOKEN` | *(auto-registered by setup.ts)* | Bearer token for authenticated calls |
| `PORT` | `3000` | Port for the API server (used by Docker and direct run) |
