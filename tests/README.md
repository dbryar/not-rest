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
API_URL=http://localhost:3000 AUTH_TOKEN=<token> bun test
```

### Docker Testing

```bash
docker compose -f docker/docker-compose.yml up --build -d
API_URL=http://localhost:3000 AUTH_TOKEN=<token> bun test
```

### Python API

```bash
cd api/python
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 3001 &

# Register a token, then run tests
curl -X POST http://localhost:3001/_internal/tokens \
  -H "Content-Type: application/json" \
  -d '{"token":"my-token","scopes":["todos:read","todos:write","reports:read"]}'

API_URL=http://localhost:3001 AUTH_TOKEN=my-token bun test
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
│   └── python/               # Python implementation (FastAPI)
│       ├── requirements.txt
│       ├── Dockerfile
│       └── app/
│           ├── main.py       # FastAPI app + routes
│           ├── schemas.py    # Type hints
│           ├── operations.py # Handlers + in-memory store
│           ├── registry.py   # Registry builder
│           ├── router.py     # Envelope dispatch
│           ├── auth.py       # Token validation
│           ├── state.py      # Async state machine
│           └── media.py      # Media storage
└── docker/
    ├── docker-compose.yml
    └── .env.example
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
3. Start the server, register a token, and run: `API_URL=http://localhost:<port> AUTH_TOKEN=<token> bun test`
4. All 112 tests should pass — the same contract applies to every implementation

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `API_URL` | `http://localhost:3000` | URL of the API server to test against |
| `AUTH_TOKEN` | *(set by setup.ts)* | Bearer token for authenticated calls |
| `PORT` | `3000` | Port for the API server (used by Docker and direct run) |
