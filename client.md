# The Thinnest Client You've Ever Written

You've seen this code:

```typescript
const item = await client.users(userId).orders(orderId).items(itemId).get()
```

That chain of method calls exists for one reason: to reconstruct `GET /users/123/orders/456/items/789`. The SDK maps classes to URL segments, methods to HTTP verbs, and IDs to path parameters. It is a translation layer that turns developer intent into a resource path and then sends it over the wire.

Now look at the same intent in OpenCALL:

```typescript
const item = await call("v1:orders.getItem", { orderId: "456", itemId: "789" })
```

One call. The operation name carries the intent. The arguments carry the data. There is nothing to reconstruct, nothing to translate, nothing to nest. The wire format IS the developer interface.

---

## REST SDKs Are Apology Code

Every REST SDK does the same five things:

1. **Maps a class hierarchy to URL segments.** `client.users` → `/users`. `client.users(id).orders` → `/users/123/orders`. Each class is a path fragment wearing a method signature.

2. **Maps method names to HTTP verbs.** `.get()` → `GET`. `.create()` → `POST`. `.update()` → `PUT` or `PATCH` (which one? depends on the SDK).

3. **Interpolates IDs into URL templates.** `client.users("123")` fills the `{userId}` slot. The SDK is a string interpolation engine disguised as a fluent API.

4. **Interprets status codes.** Is `404` "not found" or "this endpoint doesn't exist"? Is `400` a validation error or a malformed request? Is `409` a conflict or an idempotency failure? The SDK guesses, and sometimes it guesses wrong.

5. **Wraps inconsistent error shapes.** Every REST API has its own error format. Some put errors in the body. Some use HTTP status codes as the error. Some do both. The SDK normalizes the mess.

Each of these steps compensates for REST's design. The URL hierarchy, the verb overloading, the status code semantics — none of these are things developers want to think about. They want to say "get this order item" and get the item back. The SDK exists to bridge the gap between that intent and REST's wire format.

Here's the irony: REST was supposed to be "human-readable" because URLs are readable. But no developer calls `PATCH /users/123/preferences` by hand. They use an SDK that hides the URL entirely and gives them `client.updatePreferences(userId, prefs)` — which is exactly the intent that should have been on the wire in the first place.

The SDK is the apology. "Sorry our wire format is hostile. Here's a wrapper that makes it feel like a normal function call."

OpenCALL skips the apology.

---

## An OpenCALL Client Is One Function

Here is a complete OpenCALL client:

```typescript
type CallResponse = {
  requestId: string
  sessionId?: string
  state: "complete" | "accepted" | "pending" | "streaming" | "error"
  result?: unknown
  error?: { code: string; message: string; cause?: unknown }
  location?: { uri: string; auth?: { credentialType: string; credential: string; expiresAt?: number } }
  stream?: {
    transport: string
    encoding: string
    schema: string
    location: string
    sessionId: string
    expiresAt?: number
    auth?: { credentialType: string; credential: string; expiresAt?: number }
  }
  retryAfterMs?: number
  expiresAt?: number
}

async function call(
  op: string,
  args: Record<string, unknown>,
  ctx?: {
    requestId?: string
    sessionId?: string
    parentId?: string
    idempotencyKey?: string
    timeoutMs?: number
  },
): Promise<CallResponse> {
  const res = await fetch("https://api.example.com/call", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify({
      op,
      args,
      ctx: { requestId: crypto.randomUUID(), ...ctx },
    }),
  })
  return res.json()
}
```

That is the entire client. Not a module. Not a package with hundreds of generated classes, one per resource, each with methods mapping to HTTP verbs. One function. It wraps intent in an envelope and sends it.

REST SDKs are big because REST has a big translation surface. OpenCALL clients are small because there is no translation.

---

## The Registry Is Your SDK

REST APIs use OpenAPI specs to describe their surface, and then a codegen tool generates an SDK from that spec. The SDK is an intermediary artifact between the spec and the caller. It can drift. It can be wrong. It can be out of date.

OpenCALL uses a live registry:

```
GET /.well-known/ops
```

This returns the operation registry — schemas, execution models, auth requirements, media constraints. The registry IS the contract. A codegen tool reads it and generates typed wrappers. An agent reads it at runtime and calls operations directly. There is no intermediary artifact that can drift.

```json
{
  "callVersion": "2026-02-10",
  "operations": [
    {
      "op": "v1:orders.getItem",
      "argsSchema": {
        "type": "object",
        "properties": {
          "orderId": { "type": "string" },
          "itemId": { "type": "string" }
        },
        "required": ["orderId", "itemId"]
      },
      "resultSchema": {
        "type": "object",
        "properties": {
          "name": { "type": "string" },
          "quantity": { "type": "integer" },
          "price": { "type": "number" }
        }
      },
      "executionModel": "sync",
      "sideEffecting": false,
      "authScopes": ["orders:read"],
      "deprecated": true,
      "sunset": "2026-06-01",
      "replacement": "v2:orders.getItem"
    },
    {
      "op": "v2:orders.getItem",
      "argsSchema": {
        "type": "object",
        "properties": {
          "orderId": { "type": "string" },
          "itemId": { "type": "string" },
          "includeHistory": { "type": "boolean" }
        },
        "required": ["orderId", "itemId"]
      },
      "resultSchema": {
        "type": "object",
        "properties": {
          "name": { "type": "string" },
          "quantity": { "type": "integer" },
          "price": { "type": "number" },
          "currency": { "type": "string" }
        }
      },
      "executionModel": "sync",
      "sideEffecting": false,
      "authScopes": ["orders:read"]
    },
    {
      "op": "v1:orders.place",
      "argsSchema": {
        "type": "object",
        "properties": {
          "items": { "type": "array" },
          "shippingAddress": { "type": "object" }
        },
        "required": ["items", "shippingAddress"]
      },
      "resultSchema": {
        "type": "object",
        "properties": {
          "orderId": { "type": "string" },
          "estimatedDelivery": { "type": "string", "format": "date" }
        }
      },
      "executionModel": "async",
      "sideEffecting": true,
      "idempotencyRequired": true,
      "authScopes": ["orders:write"]
    }
  ]
}
```

From this, the entire typed "SDK" is generated:

```typescript
// Auto-generated from /.well-known/ops

export const orders = {
  /** @deprecated Use orders.getItemV2 instead. Sunset: 2026-06-01 */
  getItem: (args: { orderId: string; itemId: string }) => call("v1:orders.getItem", args),

  getItemV2: (args: { orderId: string; itemId: string; includeHistory?: boolean }) => call("v2:orders.getItem", args),

  place: (args: { items: OrderItem[]; shippingAddress: Address }) => call("v1:orders.place", args, { idempotencyKey: crypto.randomUUID() }),
} as const
```

The generated layer is optional. You can always call `call("v2:orders.getItem", { ... })` directly. The typed wrappers add type safety, but they are a convenience — a few lines of glue over the same single function.

### IDE Autocomplete for Free

The registry response is JSON Schema. A codegen step that fetches `/.well-known/ops` and emits a `.d.ts` file gives your IDE everything it needs — operation names as a union type, args validated per-operation, results typed per-operation. No SDK package to install. No version to pin. Run the generator, get types.

```typescript
// Generated: call.d.ts

type Operations = {
  /** @deprecated Use v2:orders.getItem instead. Sunset: 2026-06-01 */
  "v1:orders.getItem": {
    args: { orderId: string; itemId: string }
    result: { name: string; quantity: number; price: number }
  }
  "v2:orders.getItem": {
    args: { orderId: string; itemId: string; includeHistory?: boolean }
    result: { name: string; quantity: number; price: number; currency: string }
  }
  "v1:orders.place": {
    args: { items: OrderItem[]; shippingAddress: Address }
    result: { orderId: string; estimatedDelivery: string }
  }
}

declare function call<Op extends keyof Operations>(op: Op, args: Operations[Op]["args"], ctx?: CallContext): Promise<CallResponse<Operations[Op]["result"]>>
```

Type `call("` and the IDE shows you every operation. Pick one, and args are constrained to that operation's schema. The result is typed to match. This is not a fantasy — it is a `fetch` call to the registry and a JSON Schema to TypeScript transform. The tooling already exists.

For agents, there is no SDK at all. The agent reads `/.well-known/ops` at runtime, understands what operations exist, what arguments they take, and calls them. No installation. No version pinning. No "upgrade to SDK v4.2 to get the new endpoints."

---

## Three Execution Models, One Call Site

All three execution models start the same way: `POST /call`. The difference is in what comes back. See the [full execution model definitions](specification.md#execution-models) for protocol details.

### Synchronous: Call and Done

```json
// Request
{
  "op": "v1:orders.getItem",
  "args": { "orderId": "456", "itemId": "789" },
  "ctx": { "requestId": "aaa-bbb-ccc" }
}

// Response — 200
{
  "requestId": "aaa-bbb-ccc",
  "state": "complete",
  "result": { "name": "Widget", "quantity": 2, "price": 29.99 }
}
```

One request. One response. `state` is `complete`. Read the `result`. Done.

### Asynchronous: Call, Then Poll

```json
// Request
{
  "op": "v1:orders.place",
  "args": { "items": [{ "sku": "WIDGET-1", "quantity": 2 }], "shippingAddress": { "line1": "123 Main St" } },
  "ctx": {
    "requestId": "ddd-eee-fff",
    "idempotencyKey": "order-place-2026-02-10-001"
  }
}

// Response — 202
{
  "requestId": "ddd-eee-fff",
  "state": "accepted",
  "location": { "uri": "https://api.example.com/ops/ddd-eee-fff" },
  "retryAfterMs": 1000
}
```

The server tells you where to poll and how long to wait. The client does not construct URLs. It reads `location.uri` and checks back:

```typescript
async function callAndWait(op: string, args: Record<string, unknown>, ctx?: Parameters<typeof call>[2]): Promise<CallResponse> {
  let res = await call(op, args, ctx)

  while (res.state === "accepted" || res.state === "pending") {
    await new Promise((r) => setTimeout(r, res.retryAfterMs ?? 1000))
    const pollRes = await fetch(res.location!.uri, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
    res = await pollRes.json()
  }

  return res
}
```

The client's job is to wait and re-check. The `state` field tells it when to stop. No status code branching, no guessing.

### Streaming: Call, Then Connect

```json
// Request
{
  "op": "v1:device.subscribePosition",
  "args": { "deviceId": "arm-joint-1", "frequencyHz": 100 },
  "ctx": {
    "requestId": "ggg-hhh-iii",
    "sessionId": "mission-001"
  }
}

// Response — 202
{
  "requestId": "ggg-hhh-iii",
  "sessionId": "mission-001",
  "state": "streaming",
  "stream": {
    "transport": "wss",
    "encoding": "protobuf",
    "schema": "device.PositionFrame",
    "location": "wss://streams.example.com/s/ggg-hhh-iii",
    "sessionId": "mission-001",
    "expiresAt": 1739282400
  }
}
```

The response hands back everything the client needs: transport, encoding, schema, location, session ID, expiry. The client reads the `stream` object and connects:

```typescript
const sub = await call(
  "v1:device.subscribePosition",
  {
    deviceId: "arm-joint-1",
    frequencyHz: 100,
  },
  { sessionId: "mission-001" },
)

const ws = new WebSocket(sub.stream!.location)
ws.binaryType = "arraybuffer"
ws.onmessage = (event) => {
  const frame = PositionFrame.decode(new Uint8Array(event.data))
  actuate(frame)
}
```

Frames arrive as raw encoded data — no envelope wrapping per frame. For 100Hz position data, every byte matters. See [Stream Subscription Lifecycle](specification.md#stream-subscription-lifecycle) for termination and reconnection semantics.

---

## Media: Two Paths, Same Envelope

Two audiences, two delivery modes, one outcome. See [Media Ingress](specification.md#media-ingress) for the full specification.

### Browser Path: Multipart

Native `FormData`. No upload SDK. No framework.

```typescript
const form = new FormData()
form.append(
  "envelope",
  JSON.stringify({
    op: "v1:identity.verify",
    args: {
      fullName: "Jane Smith",
      dateOfBirth: "1990-05-15",
    },
    media: [
      { name: "selfie", mimeType: "image/jpeg", part: "selfie" },
      { name: "bankStatement", mimeType: "application/pdf", part: "bankStatement" },
    ],
    ctx: { requestId: crypto.randomUUID() },
  }),
)
form.append("selfie", selfieFile)
form.append("bankStatement", statementFile)

const res = await fetch("https://api.example.com/call", {
  method: "POST",
  headers: { Authorization: `Bearer ${token}` },
  body: form,
})
```

The envelope rides alongside the files in a standard multipart request. A `<form>` element or `fetch` with `FormData` can construct this. Zero dependencies.

### Agent Path: References

Clean JSON. No multipart boundary handling.

```json
{
  "op": "v1:identity.verify",
  "args": {
    "fullName": "Jane Smith",
    "dateOfBirth": "1990-05-15"
  },
  "media": [
    { "name": "selfie", "mimeType": "image/jpeg", "ref": "https://uploads.example.com/obj/abc123" },
    { "name": "bankStatement", "mimeType": "application/pdf", "ref": "https://uploads.example.com/obj/def456" }
  ],
  "ctx": { "requestId": "..." }
}
```

The agent uploaded the files separately — via a pre-signed URL or an upload operation — and passes references. No multipart construction, no boundary handling. Just JSON.

Both paths produce the same `media` array. The server handles them identically. The `mediaSchema` in the registry tells both audiences exactly what's accepted — MIME types, max sizes, required vs. optional — before they send anything.

---

## Chunked Retrieval

For large results, the server streams data as chunks that the client pulls on its own schedule. See [Chunked Result Retrieval](specification.md#chunked-result-retrieval-pull-based-streaming) for the full specification.

```
GET /ops/{requestId}/chunks              → first chunk
GET /ops/{requestId}/chunks?cursor=...   → next chunk
...repeat until state=complete
```

Each chunk carries a checksum and a reference to the previous chunk's checksum. The client MUST verify both. This is not optional — the spec mandates it for data integrity during reassembly.

```typescript
async function retrieveChunked(requestId: string): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  let cursor: string | undefined
  let previousChecksum: string | null = null

  while (true) {
    const url = cursor ? `https://api.example.com/ops/${requestId}/chunks?cursor=${cursor}` : `https://api.example.com/ops/${requestId}/chunks`

    const res: ChunkResponse = await fetch(url, {
      headers: { Authorization: `Bearer ${getToken()}` },
    }).then((r) => r.json())

    if (res.state === "error") {
      throw new Error(`Error retrieving chunk: ${res.error.code} - ${res.error.message}`)
    }

    // Verify chain — detect gaps or reordering
    if (res.chunk.checksumPrevious !== previousChecksum) {
      throw new Error("Chunk chain broken")
    }

    // Verify data — detect corruption
    const data = base64ToBytes(res.data)
    const hash = await sha256(data)
    if (`sha256:${hash}` !== res.chunk.checksum) {
      throw new Error("Chunk checksum mismatch")
    }

    chunks.push(data)
    previousChecksum = res.chunk.checksum

    if (res.state === "complete") break
    cursor = res.cursor
  }

  return concatenate(chunks)
}
```

The server controls chunk size and cursor semantics. The client's job is to pull, verify, and reassemble.

---

## Contract Evolution

Operations change. Fields get added, schemas get restructured, execution models shift. OpenCALL handles this with version-prefixed operation names and a deprecation lifecycle. See [Schema Evolution](specification.md#schema-evolution) for the full rules.

### Additive Changes Are Free

Adding an optional arg or a new result field is safe. Existing callers ignore fields they don't recognize. The operation stays `v1:orders.getItem` — no version bump needed.

### Breaking Changes Create a New Version

When a field is removed, renamed, or a type narrows, the server introduces a new version. Both appear in the registry:

```
v1:orders.getItem   → deprecated, sunset 2026-06-01
v2:orders.getItem   → current
```

The old version keeps working until its sunset date. The new version is available immediately. Callers migrate on their own schedule.

### Agents Pick the Highest Non-Deprecated Version

An agent reading `/.well-known/ops` sees both versions. The convention is simple: pick the highest version that isn't deprecated. Codegen tools emit `@deprecated` annotations (as shown in the [generated SDK example above](#the-registry-is-your-sdk)), so human developers get IDE warnings too.

### No Version Pinning

There is no client-side version negotiation. The server serves the current registry. The client reads it and adapts. If `v1:orders.getItem` disappears after its sunset date, the client gets a `410` with the replacement name in the error payload. The registry is always current — no pinned SDK version to hold you back.

---

## Auth: Transport-Aware, Client-Simple

OpenCALL auth adapts to the transport. The client does the natural thing for each context. See [Auth Model](specification.md#auth-model) for the full specification.

**HTTP** — auth goes in the header. No `auth` block in the envelope.

```typescript
await fetch("https://api.example.com/call", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: "Bearer eyJ...",
  },
  body: JSON.stringify({ op: "v1:orders.getItem", args: { orderId: "456", itemId: "789" } }),
})
```

**MQTT / Kafka** — the transport doesn't carry auth natively, so it goes in the envelope.

```json
{
  "op": "v1:device.readSensor",
  "args": { "sensorId": "temp-01" },
  "auth": {
    "iss": "auth.example.com",
    "sub": "device:arm-001",
    "credentialType": "bearer",
    "credential": "eyJ..."
  },
  "ctx": { "requestId": "..." }
}
```

**Streams** — the server issues short-lived credentials as part of the subscription response. The client consumes them and connects. No separate auth flow.

```typescript
const sub = await call("v1:device.subscribePosition", { deviceId: "arm-1" })
// sub.stream.auth = { credentialType: "bearer", credential: "short-lived-xyz", expiresAt: 1739282400 }

const ws = new WebSocket(sub.stream!.location, {
  headers: { Authorization: `Bearer ${sub.stream!.auth!.credential}` },
})
```

When stream credentials expire, the client re-subscribes. The server issues fresh credentials. The client never manages token refresh for stream connections — that is a new subscription.

---

## Less Code, Not More

| Concern                    | REST SDK                                                         | OpenCALL Client                              |
| -------------------------- | ---------------------------------------------------------------- | -------------------------------------------- |
| URL construction           | Class hierarchy mapping to path segments                         | None — `op` is a string                      |
| Verb selection             | Method names mapped to HTTP verbs                                | None — always `POST /call`                   |
| Status code interpretation | Switch on 200, 201, 204, 400, 404, 409...                        | Read `state` field                           |
| Error handling             | Mix of HTTP codes + body parsing                                 | `state=error` with structured `error` object |
| Pagination                 | Varies per API (cursor, offset, page, link headers)              | `cursor` on chunked retrieval                |
| Auth                       | SDK-specific config objects and interceptors                     | Header (HTTP) or envelope (other transports) |
| Streaming                  | Separate WebSocket client, SSE handler, or polling abstraction   | `stream` object tells you where and how      |
| Media upload               | Separate upload endpoint, presigned URL flow, multipart builders | `media` array on the same call               |
| Codegen input              | OpenAPI spec (external artifact, can drift)                      | `/.well-known/ops` (live, canonical)         |
| Versioning                 | URL path (`/v1/`, `/v2/`), header, or query param                | Version-prefixed op name with sunset dates   |
| Package size               | Hundreds of generated classes                                    | One function                                 |

An OpenCALL client is less code because there is less to do. It is not a thin wrapper over a complex protocol. It is the direct expression of intent over a simple protocol. The thinness is the point.

---

## Stop Building Translation Layers

REST SDKs exist because REST forced a gap between intent and wire format. Every SDK is a bridge across that gap. Every fluent API is a confession that the resource-oriented wire format was never meant for developers.

OpenCALL closes the gap. The operation name is the intent. The envelope is the wire format. The registry is the contract. There is nothing in between.

Your SDK was always just an apology for your API. Stop apologizing.
