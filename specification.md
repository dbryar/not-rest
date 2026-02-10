# OpenCALL — Open Command And Lifecycle Layer

## Overview

OpenCALL is a single, self-describing operation invocation API designed to serve both:
- human-facing UI/frontends, and
- LLM-powered agents (via a single `call` tool).

OpenCALL replaces endpoint-oriented REST design with an operation-based model using a uniform envelope.
The core specification is transport-agnostic; semantics are operation-driven. Transport-specific behavior is defined in the [Transport Bindings Appendix](#transport-bindings-appendix).

The system supports:
- synchronous, asynchronous, and streaming execution
- chunked pull-based result retrieval
- continuous push-based stream subscriptions (sensor, video, telemetry)
- redirection to external object/media/stream endpoints
- strong error signaling without overloading HTTP status codes
- backend orchestration via state machines
- application-level session correlation and infrastructure-level tracing

---

## Design Principles

1. **Operation-first, not resource-first**
2. **Caller does not distinguish command vs query** — the operation name carries intent
3. **Always return a meaningful payload when possible**
4. **Asynchronous by default, synchronous when cheap**
5. **Pull-based progression (agent-compatible), push-based when the domain requires it**
6. **Single canonical envelope**
7. **One controller registry, multiple bindings**
8. **No duplicate media ingress/egress**
9. **Transport-agnostic core, transport-specific bindings**
10. **Self-describing envelopes** — an envelope should be understandable in isolation

---

## Domains

- `api.example.com` — UI and general API access
- `agents.example.com` — agent access (MCP-like, single tool)
- `results.example.com` — optional external result storage (e.g. S3/CDN)
- `streams.example.com` — optional external stream endpoints

---

## Operation Invocation Endpoint

### Endpoint

```
POST /call
```

#### GET /call

Servers SHOULD respond to `GET /call` with `405 Method Not Allowed`, an `Allow: POST` header, and a JSON error body directing the caller to `POST /call` for invocation and `GET /.well-known/ops` for operation discovery.

### Operation Naming Convention

Every operation name MUST be prefixed with a version: `v{N}:namespace.operation`.

```
v1:orders.getItem
v1:identity.verify
v1:device.readPosition
```

The version prefix is part of the `op` name — it flows through the envelope, registry, and routing unchanged. Version numbers are positive integers, monotonically increasing per operation lineage (`v1`, `v2`, `v3`, ...).

All operations start at `v1`. When a breaking change is needed, a new version is introduced (e.g. `v2:orders.getItem`) while the old version remains available until its sunset date. See [Schema Evolution](#schema-evolution) for what constitutes a breaking change.

---

## Invocation Request Envelope

```json
{
  "op": "string",
  "args": { },
  "media": [
    {
      "name": "string",
      "mimeType": "string",
      "ref": "string (URI, optional)",
      "part": "string (multipart part name, optional)"
    }
  ],
  "ctx": {
    "requestId": "uuid",
    "sessionId": "uuid (optional)",
    "parentId": "uuid (optional)",
    "idempotencyKey": "string (optional)",
    "timeoutMs": 2500,
    "locale": "string (optional)",
    "traceparent": "string (optional)"
  },
  "auth": {
    "iss": "string",
    "sub": "string",
    "tokenType": "string",
    "token": "string (optional)"
  }
}
```

### Fields

- `op`
  Fully-qualified operation name. Used for routing to a controller.

- `args`
  Operation-specific payload. Validated against the operation schema.

- `media`
  Optional array of media attachments accompanying the invocation. Each entry describes one file or binary object. See [Media Ingress](#media-ingress) for full semantics.

  - `media[].name` — Logical name for the attachment (e.g. `"selfie"`, `"bankStatement"`). Must match a name declared in the operation's `mediaSchema`.
  - `media[].mimeType` — MIME type of the attachment (e.g. `"image/jpeg"`, `"application/pdf"`).
  - `media[].ref` — URI of a pre-uploaded object. Used for large files. Mutually exclusive with `part`.
  - `media[].part` — Multipart part name where the binary data is attached. Used for inline uploads via `multipart/form-data`. Mutually exclusive with `ref`.

- `ctx.requestId`
  Client-supplied or generated correlation ID.

- `ctx.sessionId`
  Optional. Groups related operations into an application-level session (e.g. a robot mission, a monitoring window, a multi-step workflow). Set by the caller.

- `ctx.parentId`
  Optional. References the `requestId` of the operation that caused this one (e.g. a `moveArm` command triggered by a sensor reading). Enables causal chaining within a session.

- `ctx.idempotencyKey`
  Required for side-effecting operations. Optional otherwise.

- `ctx.timeoutMs`
  Client hint for synchronous execution threshold.

- `ctx.locale`
  Optional localization hint.

- `ctx.traceparent`
  Optional. OpenTelemetry trace context for infrastructure-level distributed tracing. Serves a different layer than `sessionId`/`parentId` — application-level correlation vs infrastructure observability.

- `auth`
  Optional top-level authentication block. Required by transport bindings that lack native auth mechanisms (e.g. MQTT, Kafka). HTTP(S) bindings use the `Authorization` header instead. See [Auth Model](#auth-model).

- `auth.iss`
  Token issuer (e.g. `auth.example.com`).

- `auth.sub`
  Subject identity (e.g. `device:1234`, `agent:claude-session-xyz`).

- `auth.tokenType`
  Credential type (e.g. `JWT`, `API_KEY`, `mTLS`).

- `auth.token`
  The credential itself. Optional when the transport carries credentials natively.

---

## Invocation Response Envelope (Canonical)

All successful protocol-level responses return this shape.

```json
{
  "requestId": "uuid",
  "sessionId": "uuid (optional, echoed)",
  "state": "accepted | pending | complete | streaming | error",
  "result": { },
  "error": {
    "code": "string",
    "message": "string",
    "cause": { }
  },
  "stream": {
    "transport": "wss | mqtt | kafka | webrtc | quic",
    "encoding": "protobuf | json | cbor | binary",
    "schema": "string",
    "location": "string (URI)",
    "sessionId": "uuid",
    "ttlSeconds": 3600,
    "auth": {
      "tokenType": "bearer | apiKey | otk",
      "token": "string",
      "expiresAt": "ISO 8601 timestamp (optional)"
    }
  },
  "location": {
    "uri": "string",
    "auth": {
      "tokenType": "bearer | apiKey | otk",
      "token": "string",
      "expiresAt": "ISO 8601 timestamp (optional)"
    }
  },
  "retryAfterMs": 500
}
```

### Fields

- `state`
  - `complete` — operation finished, `result` present
  - `accepted` — operation accepted, execution not yet started
  - `pending` — execution in progress
  - `streaming` — stream established, `stream` object present
  - `error` — domain-level failure (not transport failure)

- `sessionId`
  Echoed from the request `ctx.sessionId` so responses are self-describing.

- `result`
  Present only when `state=complete`.

- `error`
  Present only when `state=error`.

- `stream`
  Present only when `state=streaming`. Contains everything the caller needs to connect to the stream. Fields:

  - `stream.transport` — The protocol to connect with (e.g. `wss`, `mqtt`, `kafka`, `webrtc`, `quic`).
  - `stream.encoding` — How frames are encoded on the wire (e.g. `protobuf`, `json`, `cbor`, `binary`).
  - `stream.schema` — Fully-qualified schema name for each frame, so the consumer knows how to deserialize.
  - `stream.location` — URI of the stream endpoint to connect to.
  - `stream.sessionId` — Stream session identifier.
  - `stream.ttlSeconds` — How long the stream will remain available before the server may close it.
  - `stream.auth` — Optional. Short-lived credentials for authenticating to the stream endpoint. Present when `stream.location` requires authentication beyond what the transport provides natively.
  - `stream.auth.tokenType` — Credential type: `bearer` (Authorization header), `apiKey` (query parameter or header), `otk` (one-time key consumed on first use).
  - `stream.auth.token` — The credential value.
  - `stream.auth.expiresAt` — Optional. ISO 8601 expiry timestamp. The caller MUST re-subscribe before this time to obtain fresh credentials. Omitted for one-time keys that have no time-based expiry.

- `result`, `error`, and `stream` are mutually exclusive — exactly one is present depending on `state`.

- `location`
  Present when the caller needs to retrieve a result or connect to a resource at a different endpoint. A self-describing object containing the target URI and optional auth. The server returns 303 only when the target is plain HTTP with no auth (client auto-follows). Otherwise the server returns 202 and the client reads the body to get the URI, auth, and any transport details.

  - `location.uri` — The target endpoint URI.
  - `location.auth` — Optional. Short-lived credentials for the target. Omitted when the URI is pre-signed or publicly accessible.
  - `location.auth.tokenType` — Credential type: `bearer`, `apiKey`, or `otk`.
  - `location.auth.token` — The credential value.
  - `location.auth.expiresAt` — Optional. ISO 8601 expiry timestamp.

- `retryAfterMs`
  Optional hint for polling cadence.

---

## Execution Models

The spec supports three execution models. The operation registry declares which model each operation uses.

### Synchronous

1. Caller sends `POST /call`
2. Server returns `200` with `state=complete` and `result`

Used when the operation completes within the caller's `timeoutMs` hint.

### Asynchronous

1. Caller sends `POST /call`
2. Server returns `202` with `state=accepted` and a `location` for polling
3. Caller polls `GET /ops/{requestId}` until `state=complete` or `state=error`

Used for long-running operations.

### Stream Subscription

1. Caller sends `POST /call` with a streaming operation (e.g. `op: "v1:subscribeToStream"`)
2. Server returns `202` with the canonical response envelope containing the `stream` object (streams involve a transport change, so 303 auto-follow is not appropriate)
3. Caller reads the `stream` object, connects to `stream.location` using the specified `stream.transport` and credentials if provided
4. Frames arrive as raw encoded data — no envelope wrapping per frame

Used for continuous data feeds (sensor telemetry, video, position tracking).

---

## HTTP Status Code Semantics

### Always Return Payloads

The system MUST return a descriptive payload whenever possible.

### Status Code Usage

| Status | Meaning |
|------|--------|
| 200 | Successful synchronous completion |
| 202 | Accepted — result available later, or resource available at a location requiring auth or a non-HTTP transport. The response body contains the `location` or `stream` object. Client MUST read the body before connecting |
| 303 | Resource available at an unsecured HTTP location. No auth required, no transport change. Client may auto-follow the `Location` header |
| 400 | Invalid operation — the request is malformed, the operation does not exist, or the arguments fail schema validation. The error payload describes why |
| 401 | Authentication invalid |
| 403 | Authentication valid but insufficient |
| 404 | Resource not found — the requested operation result, chunk, or media object does not exist or has expired |
| 405 | Method not allowed — the HTTP method is not supported for the requested endpoint |
| 410 | Operation removed — the operation existed but has been removed past its sunset date. The error payload includes `replacement` if a successor exists |
| 500 | Internal failure with full error payload |
| 502 | Upstream dependency failure |
| 503 | Service unavailable |

### Notes

- Domain errors MUST be represented using `state=error`, not HTTP 4xx. The 400 and 404 codes are reserved for protocol-level failures (bad requests and missing resources), not business logic errors.
- 400 responses MUST include the canonical error envelope describing the validation failure (e.g. unknown operation, missing required arguments, schema mismatch).
- 404 responses on `/ops/{requestId}` or `/ops/{requestId}/chunks` indicate the operation instance has expired past its TTL or never existed. Callers should not retry.
- HTTP 500 responses MUST include a full error payload and a panic/error code.
- Zero-information 500 responses are forbidden.
- 303 is reserved for plain HTTP redirects with no auth and no transport change (e.g. pre-signed S3 URL, public CDN). The `Location` header and `location.uri` carry the same URI.
- 202 MUST be used instead of 303 when any of: auth is required, the target uses a non-HTTP transport (WebSocket, MQTT, QUIC, etc.), or the result is not yet ready. The caller reads the body and connects manually.
- 410 responses indicate that a deprecated operation has been removed past its sunset date. The error payload MUST include the `OP_REMOVED` code and SHOULD include the `replacement` operation name if one exists.

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
    "length": 1048576,
    "checksum": "sha256:a1b2c3d4...",
    "checksumPrevious": null
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

- `chunk.checksum`
  SHA-256 hash of this chunk's `data` payload. The receiver MUST verify this before accepting the chunk. Format: `sha256:{hex}`.

- `chunk.checksumPrevious`
  SHA-256 hash of the immediately preceding chunk's `data` payload — a single value, not a cumulative list. `null` for the first chunk. Enables the receiver to verify that chunks are consumed in order and detect gaps during reassembly.

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

1. Operation returns either:
   - `303 See Other` with `Location` header — when no auth is needed and the target is plain HTTP (e.g. pre-signed URL, public CDN). Client auto-follows.
   - `202 Accepted` with `location` object — when credentials are needed or the target uses a non-HTTP transport. Client reads the body and connects manually.

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

## Media Ingress

Operations that accept binary attachments (images, documents, audio, video) use the `media` array on the request envelope.

### Two Delivery Modes

**Inline (multipart)** — The binary is sent as a part in a `multipart/form-data` request. The `media` entry references it by `part` name. The envelope JSON is sent as a part named `envelope`. This is the browser-native path — a standard `<form>` or `fetch` with `FormData` can construct it without any framework.

**Reference (pre-uploaded)** — The binary is uploaded to an external object store beforehand (e.g. via a pre-signed URL). The `media` entry references it by `ref` URI. The request is plain JSON. This is the natural path for agents and programmatic callers — no multipart overhead, just a clean JSON envelope.

Each `media` entry uses exactly one of `part` or `ref`, never both.

### Audience Guidance

The two delivery modes map naturally to the two audiences:

- **Browsers and human-facing UIs** use **inline multipart**. Native `FormData`, native `<form>`, zero framework dependencies.
- **Agents and programmatic callers** use **references**. Plain JSON, no multipart construction, no boundary handling. The agent uploads the file first (via a pre-signed URL or an upload operation), then sends a clean call with `ref` URIs.

Both paths produce the same `media` array on the envelope. The server handles them identically.

### Example: Identity Verification

A user submits a selfie, a bank statement PDF, and structured form data in a single invocation:

```
POST /call HTTP/1.1
Host: api.example.com
Authorization: Bearer eyJ...
Content-Type: multipart/form-data; boundary=----boundary

------boundary
Content-Disposition: form-data; name="envelope"
Content-Type: application/json

{
  "op": "v1:identity.verify",
  "args": {
    "fullName": "Jane Smith",
    "dateOfBirth": "1990-05-15",
    "address": "123 Main St, Sydney NSW 2000"
  },
  "media": [
    { "name": "selfie", "mimeType": "image/jpeg", "part": "selfie" },
    { "name": "bankStatement", "mimeType": "application/pdf", "part": "bankStatement" }
  ],
  "ctx": {
    "requestId": "550e8400-e29b-41d4-a716-446655440000",
    "idempotencyKey": "verify-jane-2026-02-10"
  }
}
------boundary
Content-Disposition: form-data; name="selfie"; filename="selfie.jpg"
Content-Type: image/jpeg

<binary JPEG data>
------boundary
Content-Disposition: form-data; name="bankStatement"; filename="statement.pdf"
Content-Type: application/pdf

<binary PDF data>
------boundary--
```

### Example: Large File via Reference

A pre-uploaded video is referenced by URI:

```json
{
  "op": "v1:media.transcode",
  "args": { "outputFormat": "h265", "quality": "high" },
  "media": [
    { "name": "source", "mimeType": "video/mp4", "ref": "https://uploads.example.com/obj/abc123" }
  ],
  "ctx": {
    "requestId": "660e8400-e29b-41d4-a716-446655440001"
  }
}
```

### Operation Registry

Operations that accept media declare a `mediaSchema` in the registry:

```json
{
  "op": "v1:identity.verify",
  "mediaSchema": [
    { "name": "selfie", "required": true, "acceptedTypes": ["image/jpeg", "image/png"], "maxBytes": 10485760 },
    { "name": "bankStatement", "required": true, "acceptedTypes": ["application/pdf"], "maxBytes": 52428800 }
  ]
}
```

- `name` — Matches the `media[].name` in the request envelope.
- `required` — Whether the attachment is mandatory.
- `acceptedTypes` — Allowed MIME types. The server MUST reject attachments with types not in this list.
- `maxBytes` — Maximum file size. The server MUST reject attachments exceeding this limit.

Agents discover media requirements via `/.well-known/ops` and can construct valid multipart requests or pre-upload files accordingly.

### Rules

- The `media` array is always optional at the envelope level. Operations that require attachments enforce this via `mediaSchema`.
- The server MUST validate each attachment's `mimeType` and size against the operation's `mediaSchema`.
- When using inline multipart delivery, the envelope JSON MUST be in a part named `envelope`.
- When no `media` is present, the request is plain `application/json` as normal.

---

## Stream Subscription Lifecycle

### Subscription

1. Caller sends `POST /call` with a streaming operation and relevant `args`
2. Server returns `202` with the `stream` object (streams involve a transport change)
3. Caller reads the body, connects to `stream.location` using the specified `stream.transport` and credentials if provided
4. Frames arrive as raw encoded data in the declared `encoding` and `schema` — no per-frame envelope overhead

### During the Stream

- Frames are raw bytes in the declared `encoding` and `schema`. No per-frame envelope wrapping. For high-frequency streams (e.g. a robot joint streaming position at 100Hz), every byte counts.
- The stream is one-way: server to caller. If the caller needs to send commands back, that is a separate `POST /call` correlated via `sessionId`.
- Multiple concurrent streams can share a `sessionId` (e.g. position, torque, and vision streams all part of one mission).

### Frame Integrity (Optional)

For streams where data integrity must be verified above the transport layer, the server MAY prepend a lightweight integrity header to each frame. The format is transport-binding specific, but the logical fields are:

- `seq` — Monotonically increasing frame sequence number
- `checksum` — Hash of the frame payload (e.g. CRC-32 for low-latency, SHA-256 for high-assurance)

Frame integrity is optional because most stream transports (QUIC, TLS-over-WebSocket, MQTT with QoS 1+) already provide delivery guarantees. It is recommended for:
- Untrusted or lossy transport layers
- Safety-critical applications (robotics actuation, medical devices)
- Scenarios where the consumer must detect gaps in the frame sequence

The operation registry MAY declare `frameIntegrity: true` to indicate that frames for a given operation include integrity headers.

### Termination

- **Caller-initiated** — The caller calls an `unsubscribeFromStream` operation, passing the stream's `sessionId` or `requestId`.
- **Server-initiated** — The server closes the transport channel. The caller should treat a closed channel as stream-ended and re-subscribe if needed.
- **TTL expiry** — `stream.ttlSeconds` defines maximum stream lifetime. The server may close the stream after expiry. The caller can re-subscribe.

### Observability

- The original `requestId` from the call identifies the subscription.
- `ctx.traceparent` propagates through to the stream infrastructure for end-to-end tracing.
- `ctx.sessionId` groups related streams and commands within the same application-level session.
- The operation registry declares which ops return streams, so agents can discover streaming capabilities via `/.well-known/ops`.

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

### Operation Removed (410)

```json
{
  "requestId": "uuid",
  "state": "error",
  "error": {
    "code": "OP_REMOVED",
    "message": "v1:orders.getItem was removed on 2026-06-01",
    "cause": {
      "removedOp": "v1:orders.getItem",
      "replacement": "v2:orders.getItem"
    }
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

## Data Integrity

### Chunk Integrity (Pull-Based)

Pull-based chunked retrieval MUST include per-chunk checksums (`chunk.checksum`) and chain validation (`chunk.checksumPrevious`). This is not optional — when a caller is reassembling a file or dataset from chunks, integrity verification is essential. See [Chunked Result Retrieval](#chunked-result-retrieval-pull-based-streaming) for the field definitions.

### Frame Integrity (Push-Based Streams)

Push-based stream frames MAY include lightweight integrity headers. This is optional and declared per-operation in the registry via `frameIntegrity: true`. See [Frame Integrity](#frame-integrity-optional) for details.

### Response Signing

The core spec does not define response signing at the envelope level. Response authenticity and integrity are transport-layer concerns:

- **HTTP(S)** — TLS provides transport integrity. For additional assurance, implementers can use HTTP Message Signatures ([RFC 9421](https://www.rfc-editor.org/rfc/rfc9421)) or mTLS for mutual authentication.
- **QUIC** — TLS 1.3 is built in.
- **MQTT/Kafka** — TLS on the broker connection.

When security requirements demand end-to-end response signing beyond transport guarantees (e.g. non-repudiation, offline verification, multi-hop relay scenarios), implementers SHOULD use HTTP Message Signatures or equivalent mechanisms at the transport binding layer rather than adding signing fields to the canonical envelope.

---

## Schema Evolution

Operations evolve. The versioning model ensures that evolution is safe for existing callers.

### Safe Changes (Non-Breaking)

These changes do not require a new version. The operation keeps its existing `v{N}:` prefix:

- Add an optional field to `argsSchema`
- Add a field to `resultSchema`
- Add an optional slot to `mediaSchema`
- Widen a type (e.g. `integer` → `number`, enum gains a value)
- Relax a constraint (e.g. reduce `minLength`, increase `maxBytes`)

### Breaking Changes

These changes require a new version (`v{N+1}:op.name`):

- Remove or rename a field in `argsSchema` or `resultSchema`
- Narrow a type (e.g. `number` → `integer`, enum loses a value)
- Make an optional field required
- Change the `executionModel` (e.g. `sync` → `async`)
- Remove an accepted MIME type from `mediaSchema`

When a breaking change is needed, introduce the new version (e.g. `v2:orders.getItem`) and deprecate the old version (e.g. `v1:orders.getItem`). Both versions coexist in the registry until the old version's sunset date.

### Robustness Principle

Callers MUST ignore unknown fields in response envelopes, result payloads, and stream frames. This ensures that additive server-side changes — new result fields, new envelope metadata — do not break existing callers.

---

## Auth Model

Authentication is transport-aware. The core spec defines the `auth` shape; enforcement is deferred to transport bindings.

### Auth Block Shape

```json
{
  "auth": {
    "iss": "string",
    "sub": "string",
    "tokenType": "JWT | API_KEY | mTLS",
    "token": "string (optional)"
  }
}
```

- `iss` — Token issuer (e.g. `auth.example.com`)
- `sub` — Subject identity (e.g. `device:1234`, `agent:claude-session-xyz`)
- `tokenType` — Credential type
- `token` — The credential itself. Optional when the transport carries it natively.

### Transport Auth Mapping

| Transport | Auth mechanism | `auth` in envelope? |
|-----------|---------------|---------------------|
| HTTP(S) | `Authorization` header | No — use header |
| WebSocket | Initial handshake header, or first message | Optional after handshake |
| MQTT | MQTT `CONNECT` credentials + envelope `auth` | Yes |
| Kafka | SASL for broker auth + envelope `auth` for caller identity | Yes |
| WebRTC | Signaling channel (HTTPS) handles auth | No — handled at signaling |
| QUIC | TLS 1.3 built into transport + envelope `auth` if needed | Optional |

### Rules

- The envelope `auth` block is always optional in the core spec.
- Transport bindings declare whether it is required.
- The server returns 202 (not 303) when auth is required or the target uses a non-HTTP transport. Short-lived credentials are provided via `stream.auth` (for streams) or `location.auth` (for media/results). 303 is reserved for plain HTTP redirects with no auth and no transport change. See the [response envelope](#invocation-response-envelope-canonical) for field definitions.
- The operation registry's `authScopes` field declares what permissions each operation requires, regardless of transport.

---

## Operation Registry (Source of Truth)

Each operation is defined in code with:

- `op` name (version-prefixed: `v1:namespace.operation`)
- argument schema (JSON Schema)
- result schema (JSON Schema)
- media schema (accepted attachments, for operations that accept media)
- frame schema (JSON Schema, for streaming operations)
- side-effecting flag
- idempotency requirement
- execution model (`sync`, `async`, or `stream`)
- max synchronous execution time
- chunk support flag
- supported transports (for streaming operations)
- supported encodings (for streaming operations)
- default stream TTL (for streaming operations)
- frame integrity flag (for streaming operations)
- auth scopes
- caching policy
- deprecated flag (optional, defaults to `false`)
- sunset date (ISO 8601 `YYYY-MM-DD`, present only when deprecated)
- replacement operation name (present only when deprecated)

### Registry Entry Example

```json
{
  "op": "v1:subscribeToStream",
  "argsSchema": { },
  "resultSchema": { },
  "frameSchema": { },
  "sideEffecting": false,
  "idempotencyRequired": false,
  "maxSyncMs": 500,
  "executionModel": "stream",
  "supportedTransports": ["wss", "mqtt", "quic"],
  "supportedEncodings": ["protobuf", "json"],
  "authScopes": ["device:read"],
  "cachingPolicy": "none",
  "ttlSeconds": 3600,
  "frameIntegrity": false
}
```

### Deprecated Registry Entry Example

When an operation is deprecated, the registry entry includes `deprecated`, `sunset`, and `replacement`:

```json
{
  "op": "v1:orders.getItem",
  "argsSchema": { },
  "resultSchema": { },
  "sideEffecting": false,
  "executionModel": "sync",
  "authScopes": ["orders:read"],
  "deprecated": true,
  "sunset": "2026-06-01",
  "replacement": "v2:orders.getItem"
}
```

### Deprecation Fields

- `deprecated` — Boolean, optional, defaults to `false`. When `true`, callers SHOULD migrate to the `replacement` operation.
- `sunset` — ISO 8601 date (`YYYY-MM-DD`), present only when `deprecated` is `true`. The server MUST continue to serve the operation until this date. After the sunset date, the server MAY remove the operation and return `410 Gone` with an `OP_REMOVED` error.
- `replacement` — The `op` name of the replacement operation (e.g. `v2:orders.getItem`), present only when `deprecated` is `true`.

### Fields

- `executionModel` — Declares how the operation executes: `sync` returns a result immediately, `async` returns a polling location, `stream` returns 202 with stream metadata.
- `frameSchema` — Schema describing each frame in a stream. Present only when `executionModel=stream`. Enables agents to understand frame structure before subscribing.
- `supportedTransports` — Which transports a streaming operation can deliver over. The caller can express preference in `args`; the server picks the best match.
- `supportedEncodings` — Which encodings are available for stream frames. Same negotiation as transports.
- `ttlSeconds` — Default stream lifetime for this operation.
- `frameIntegrity` — Whether stream frames include integrity headers (sequence number and checksum). Defaults to `false`. Recommended for safety-critical applications.

---

## Self-Description Endpoint

```
GET /.well-known/ops
```

Returns the full operation registry as a JSON object:

```json
{
  "callVersion": "2026-02-10",
  "operations": [ ]
}
```

### Top-Level Fields

- `callVersion` — Required. Calendar date (`YYYY-MM-DD`) of the OpenCALL specification version the server implements.
- `operations` — Required. Array of registry entries describing every available operation.

### Contents

The registry includes:

- list of operations (with version-prefixed names)
- schemas (argument, result, frame, and media)
- execution characteristics and models
- supported transports and encodings
- deprecation status, sunset dates, and replacements
- limits and constraints

This document is the canonical contract for:
- frontend client generation
- agent grounding
- documentation

### HTTP Caching

Servers SHOULD include `Cache-Control` and `ETag` headers on `/.well-known/ops` responses. Clients SHOULD use conditional requests (`If-None-Match`) to avoid re-fetching an unchanged registry. Standard HTTP caching is sufficient — no custom hash fields are needed.

---

## Agent Binding (MCP-like)

- Single tool: `call`
- Input matches invocation request envelope
- Output matches canonical response envelope
- Agent retrieves capabilities via `/.well-known/ops`
- Agent progression is pull-based for sync/async operations
- Agent connects to push-based streams when the operation's execution model is `stream`
- Agent uses `sessionId` to correlate related operations and streams

---

## Backend Execution Model

- Each invocation creates an Operation Instance
- Instance is managed by a state machine:
  - accepted → pending → complete | streaming | error
- State transitions are persisted
- Results and chunks are materialized in a result store
- Stream subscriptions are tracked as long-lived operation instances
- No requirement for event sourcing

---

## Non-Goals

- REST resource modeling
- Mandatory GraphQL
- Server-side media proxying
- Per-frame envelope wrapping on streams

---

## Summary

OpenCALL defines:
- one envelope
- one invocation model
- one result lifecycle (sync, async, or stream)
- one agent tool
- one controller registry
- one auth model (transport-aware)

while remaining:
- agent-compatible
- UI-friendly
- async-safe
- stream-capable
- media-efficient
- transport-agnostic
- and operationally tractable

---

## Transport Bindings Appendix

The core specification is transport-agnostic. This appendix defines how the envelope maps to specific transports. Each binding follows a consistent structure:

1. Envelope mapping — how the envelope is serialized and transmitted
2. Auth mechanism — where credentials go
3. Stream support — how streaming operations are delivered
4. Error mapping — how transport-level errors map to the canonical error model
5. Example — a complete request/response cycle

New transports can be added without modifying the core spec.

---

### HTTP(S) Binding

The primary and reference binding.

**Envelope mapping:**
`POST /call` with JSON body (`application/json`). When the invocation includes inline media attachments, the request uses `multipart/form-data` with the envelope JSON in a part named `envelope` and binary attachments in named parts. Response is always JSON.

**Auth mechanism:**
`Authorization` header. The envelope `auth` block is not used.

**Media ingress:**
Inline media uses `multipart/form-data` — browser-native via `<form>` or `fetch` with `FormData`. Pre-uploaded media uses plain JSON with `ref` URIs in the `media` array. See [Media Ingress](#media-ingress).

**Stream support:**
Stream subscriptions return `202` (streams involve a transport change, so auto-follow is not appropriate). The `stream.location` points to an external stream endpoint. The HTTP binding is used only for the handshake; actual stream delivery is over the transport specified in `stream.transport`.

**Error mapping:**
HTTP status codes map directly as defined in [HTTP Status Code Semantics](#http-status-code-semantics).

**Example:**

```
POST /call HTTP/1.1
Host: api.example.com
Authorization: Bearer eyJ...
Content-Type: application/json

{
  "op": "v1:device.readPosition",
  "args": { "deviceId": "arm-joint-1" },
  "ctx": {
    "requestId": "550e8400-e29b-41d4-a716-446655440000",
    "sessionId": "mission-001",
    "timeoutMs": 2500
  }
}

HTTP/1.1 200 OK
Content-Type: application/json

{
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "sessionId": "mission-001",
  "state": "complete",
  "result": { "x": 12.5, "y": 3.2, "z": 7.8 }
}
```

---

### WebSocket Binding

Persistent bidirectional channel for low-latency command/response with devices.

**Envelope mapping:**
Envelope sent as JSON or binary WebSocket frames. Each frame contains one complete envelope. The connection is long-lived; multiple invocations can share a single connection.

**Auth mechanism:**
Authenticated during the WebSocket upgrade handshake via `Authorization` header or query parameter. Envelope `auth` block is optional for re-authentication or token refresh during a session.

**Stream support:**
Stream data can flow over the same WebSocket connection or redirect to a dedicated channel via `stream.location`. For high-throughput streams, a dedicated channel is recommended.

**Error mapping:**
Transport errors (connection drops, protocol errors) are distinct from domain errors. The server SHOULD send a canonical error envelope before closing the connection when possible.

---

### MQTT Binding

Publish/subscribe for IoT and device communication.

**Envelope mapping:**
Envelope published as the message payload to topic `ops/{op}`. Responses published to `ops/{requestId}/response`. The caller subscribes to the response topic before publishing.

**Auth mechanism:**
MQTT `CONNECT` packet credentials for broker authentication. Envelope `auth` block is required for caller identity and authorization.

**Stream support:**
Stream frames published to `streams/{sessionId}/{op}`. The `stream.location` in the subscription response contains the full topic path. QoS mapped to operation characteristics — side-effecting operations use QoS 1+.

**Error mapping:**
Transport errors (broker disconnection, publish failures) are distinct from domain errors in the response envelope.

---

### Kafka Binding

Event-driven workloads and high-throughput stream processing.

**Envelope mapping:**
Envelope as message value. `op` as message key for partitioning. Published to a well-known operations topic.

**Auth mechanism:**
SASL for broker authentication. Envelope `auth` block is required for caller identity and authorization.

**Stream support:**
Stream frames as continuous messages on a dedicated topic specified in `stream.location`. Consumer groups enable fan-out to multiple subscribers.

**Error mapping:**
Transport errors (broker failures, consumer lag) are distinct from domain errors in the response envelope.

---

### WebRTC Binding

Real-time media and sensor streams between agents and devices.

**Envelope mapping:**
The handshake happens over HTTP(S). The `stream` object in the response contains SDP offer/answer and ICE candidate details needed to establish the WebRTC connection.

**Auth mechanism:**
Handled at the signaling layer (HTTP(S)). No envelope `auth` block needed — the stream connection inherits authorization from the signaling handshake.

**Stream support:**
Data channels carry structured sensor data (protobuf, CBOR). Media tracks carry audio/video streams. Multiple tracks and channels can be multiplexed over a single connection.

**Error mapping:**
Signaling errors use the canonical error model over HTTP(S). Transport errors during streaming (ICE failures, DTLS errors) are handled by WebRTC's native error mechanisms.

---

### QUIC Binding

Multiplexed streams over a single connection for high-throughput, multi-stream scenarios.

**Envelope mapping:**
The handshake happens over HTTP/3 (which runs on QUIC). Envelope as JSON or binary on the request stream.

**Auth mechanism:**
TLS 1.3 is built into QUIC, providing transport-level encryption and authentication. Envelope `auth` block is optional for application-level caller identity when needed.

**Stream support:**
Each logical stream maps to a QUIC stream — no head-of-line blocking between concurrent streams. Ideal for scenarios with multiple simultaneous data feeds (multiple camera feeds, sensor arrays, telemetry). Connection migration supports mobile and robotic devices that change networks without dropping streams.

**Error mapping:**
QUIC connection errors and stream resets are distinct from domain errors. The server SHOULD send a canonical error envelope on the relevant stream before resetting it when possible.
