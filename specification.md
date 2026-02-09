# Unified Operation Invocation API Specification

## Overview

This specification defines a single, self-describing operation invocation API designed to serve both:
- human-facing UI/frontends, and
- LLM-powered agents (via a single `invoke` tool).

The API replaces endpoint-oriented REST design with an operation-based model using a uniform envelope.  
Transport is HTTP(S); semantics are operation-driven.

The system supports:
- synchronous and asynchronous execution
- chunked pull-based result retrieval
- redirection to external object/media storage
- strong error signaling without overloading HTTP status codes
- backend orchestration via state machines

---

## Design Principles

1. **Operation-first, not resource-first**
2. **Caller does not distinguish command vs query**
3. **Always return a meaningful payload when possible**
4. **Asynchronous by default, synchronous when cheap**
5. **Pull-based progression (agent-compatible)**
6. **Single canonical envelope**
7. **One controller registry, multiple bindings**
8. **No duplicate media ingress/egress**

---

## Domains

- `api.example.com` — UI and general API access
- `agents.example.com` — agent access (MCP-like, single tool)
- `results.example.com` — optional external result storage (e.g. S3/CDN)

---

## Operation Invocation Endpoint

### Endpoint

```
POST /invoke
```

---

## Invocation Request Envelope

```json
{
  "op": "string",
  "args": { },
  "ctx": {
    "requestId": "uuid",
    "idempotencyKey": "string (optional)",
    "timeoutMs": 2500,
    "locale": "string (optional)"
  }
}
```

### Fields

- `op`  
  Fully-qualified operation name. Used for routing to a controller.

- `args`  
  Operation-specific payload. Validated against the operation schema.

- `ctx.requestId`  
  Client-supplied or generated correlation ID.

- `ctx.idempotencyKey`  
  Required for side-effecting operations. Optional otherwise.

- `ctx.timeoutMs`  
  Client hint for synchronous execution threshold.

- `ctx.locale`  
  Optional localization hint.

---

## Invocation Response Envelope (Canonical)

All successful protocol-level responses return this shape.

```json
{
  "requestId": "uuid",
  "state": "accepted | pending | complete | error",
  "result": { },
  "error": {
    "code": "string",
    "message": "string",
    "cause": { }
  },
  "location": "string",
  "retryAfterMs": 500
}
```

### Fields

- `state`
  - `complete` — operation finished, `result` present
  - `accepted` — operation accepted, execution not yet started
  - `pending` — execution in progress
  - `error` — domain-level failure (not transport failure)

- `result`
  Present only when `state=complete`.

- `error`
  Present only when `state=error`.

- `location`
  Present when `state=accepted|pending`. Points to result retrieval endpoint.

- `retryAfterMs`
  Optional hint for polling cadence.

---

## HTTP Status Code Semantics

### Always Return Payloads

The system MUST return a descriptive payload whenever possible.

### Status Code Usage

| Status | Meaning |
|------|--------|
| 200 | Successful synchronous completion |
| 202 | Accepted; result available later on same domain |
| 303 | Result available at alternate location (same or different domain) |
| 401 | Authentication invalid |
| 403 | Authentication valid but insufficient |
| 500 | Internal failure with full error payload |
| 502 | Upstream dependency failure |
| 503 | Service unavailable |

### Notes

- Domain errors MUST be represented using `state=error`, not HTTP 4xx.
- HTTP 500 responses MUST include a full error payload and a panic/error code.
- Zero-information 500 responses are forbidden.

---

## Asynchronous Result Retrieval

### Result State Endpoint

```
GET /ops/{requestId}
```

Returns the canonical response envelope.

---

## Chunked Result Retrieval (Pull-Based Streaming)

Used for large datasets or long-running queries.

### Endpoint

```
GET /ops/{requestId}/chunks?cursor={cursor}
```

### Response

```json
{
  "state": "pending | complete",
  "mimeType": "string",
  "cursor": "string",
  "chunk": {
    "offset": 0,
    "length": 1048576
  },
  "total": 536870912,
  "data": "base64 or binary"
}
```

### Semantics

- `cursor`  
  Opaque position marker for next retrieval.

- `chunk.offset`  
  Absolute byte offset.

- `chunk.length`  
  Size of this chunk.

- `total`  
  Total size if known; omitted if unknown.

- `mimeType`  
  Media type of the content.

- `state`
  - `pending` — more chunks available
  - `complete` — final chunk delivered

---

## Media and Large Object Handling

### Rule

The API MUST NOT proxy or re-stream large media objects (audio/video).

### Media Flow

1. Operation returns:
   - `303 See Other`
   - `Location: https://results.example.com/object`

2. No envelope is returned at the redirected location.
3. The redirected endpoint serves:
   - raw object bytes
   - correct `Content-Type`
   - standard HTTP range semantics

### Rationale

- Avoids duplicate ingress/egress
- Enables CDN optimization
- Allows native browser and media player handling

---

## Error Model

### Domain Error (Execution-Level)

```json
{
  "requestId": "uuid",
  "state": "error",
  "error": {
    "code": "DOMAIN_ERROR_CODE",
    "message": "Human-readable explanation",
    "cause": { }
  }
}
```

### Transport/System Error (500–503)

```json
{
  "requestId": "uuid",
  "state": "error",
  "error": {
    "code": "PANIC_UPSTREAM_TIMEOUT",
    "message": "Service dependency failed",
    "cause": {
      "service": "payments-db",
      "timeoutMs": 3000
    }
  }
}
```

---

## Operation Registry (Source of Truth)

Each operation is defined in code with:

- `op` name
- argument schema (JSON Schema)
- result schema (JSON Schema)
- side-effecting flag
- idempotency requirement
- max synchronous execution time
- chunk support flag
- auth scopes
- caching policy

---

## Self-Description Endpoint

```
GET /.well-known/ops
```

Returns the full operation registry:

- list of operations
- schemas
- execution characteristics
- limits and constraints

This document is the canonical contract for:
- frontend client generation
- agent grounding
- documentation

---

## Agent Binding (MCP-like)

- Single tool: `invoke`
- Input matches invocation request envelope
- Output matches canonical response envelope
- Agent retrieves capabilities via `/.well-known/ops`
- Agent progression is strictly pull-based

---

## Backend Execution Model

- Each invocation creates an Operation Instance
- Instance is managed by a state machine:
  - accepted → pending → complete | error
- State transitions are persisted
- Results and chunks are materialized in a result store
- No requirement for event sourcing

---

## Non-Goals

- Push-based streaming (SSE/WebSockets)
- REST resource modeling
- Mandatory GraphQL
- Agent-side long-lived connections
- Server-side media proxying

---

## Summary

This API defines:
- one envelope
- one invocation model
- one result lifecycle
- one agent tool
- one controller registry

while remaining:
- agent-compatible
- UI-friendly
- async-safe
- media-efficient
- and operationally tractable
