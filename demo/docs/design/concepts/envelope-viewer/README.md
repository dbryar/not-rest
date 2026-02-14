# Envelope Viewer

**Level**: 🏗️ Building
**Complexity**: 🟨 Moderate
**Convergence**: 🟢 Converged
**Design**: 🟢 Complete

## Summary

The envelope viewer is the demo's "killer feature" — a split-pane UI that shows the raw OpenCALL request/response envelopes alongside the human-friendly UI. This teaches visitors exactly how the protocol works.

## Data Model

The client maintains two in-memory stores, reset on page navigation:

### Requests Map

```typescript
// Map<number, RequestEntry> — keyed by timestamp for chronological sorting
type RequestEntry = {
  timestamp: number;        // Date.now() when sent — also the Map key
  requestId: string;        // from response (links to responses Map)
  op: string;               // e.g. "v1:catalog.list"
  method: string;           // "POST"
  url: string;              // "${API_URL}/call"
  headers: Record<string, string>;  // Authorization masked
  body: {
    op: string;
    args: Record<string, unknown>;
    ctx?: { requestId: string; sessionId?: string };
  };
};
```

### Responses Map

```typescript
// Map<string, ResponseEntry[]> — keyed by requestId, ARRAY for polling chain
type ResponseEntry = {
  timestamp: number;        // when received
  status: number;           // HTTP status (200, 202, 303, 400, 403, etc.)
  headers: Record<string, string>;
  body: {
    requestId: string;
    sessionId?: string;
    state: "complete" | "accepted" | "pending" | "error";
    result?: unknown;
    error?: unknown;
    location?: unknown;
    retryAfterMs?: number;
    expiresAt?: number;
  };
  timeMs: number;           // round-trip time
};
```

## Why Arrays for Responses?

A single request like `v1:report.generate` produces multiple responses:

1. Initial `202 Accepted` with `state=accepted`
2. Polling responses with `state=pending`
3. Final response with `state=complete`

Storing the full chain shows the async lifecycle progression.

## Display Layout

```
┌─────────────────────────────┬─────────────────────────────┐
│                             │  REQUEST                    │
│   📚 Library Catalog        │  POST /call                 │
│                             │  {                          │
│   The Great Gatsby          │    "op": "v1:catalog.list", │
│   F. Scott Fitzgerald       │    "args": { "type": "book" │
│   1925 · 3 copies avail.    │    ...                      │
│                             ├─────────────────────────────┤
│   To Kill a Mockingbird     │  RESPONSE  200  142ms       │
│   Harper Lee                │  {                          │
│   1960 · 1 copy avail.      │    "requestId": "abc...",   │
│                             │    "state": "complete",     │
│   ...                       │    "result": { "items": [.. │
└─────────────────────────────┴─────────────────────────────┘
```

## Viewer Features

- **Request list** — All entries sorted by timestamp (newest/oldest toggle)
- **Response chain** — Selected request shows all responses chronologically
- **Both visible** — No tabs, both panels visible simultaneously
- **Collapsible** — Can collapse to focus on UI
- **Syntax highlighting** — JSON keys, strings, numbers colored
- **HTTP status** — Color-coded (2xx green, 3xx blue, 4xx amber, 5xx red)
- **Timing** — Round-trip time in ms per response
- **Copy button** — Copy as curl command or raw JSON
- **Clear button** — `requests.clear()` and `responses.clear()`

## Proxy Response Format

The app server's proxy returns both request and response:

```json
{
  "request": {
    "method": "POST",
    "url": "${API_URL}/call",
    "headers": { "Authorization": "Bearer demo_***", ... },
    "body": { "op": "v1:catalog.list", ... }
  },
  "response": {
    "status": 200,
    "headers": { "Content-Type": "application/json" },
    "body": { "requestId": "...", "state": "complete", ... },
    "timeMs": 142
  }
}
```

The bearer token is masked (`demo_***`) — visible as concept, not copyable as credential.

## Async Operation Display

For `v1:report.generate`:

1. Show initial `202` with `state=accepted`
2. Auto-poll, append each `state=pending` response
3. Show final `state=complete` with location
4. Optional: Show chunk retrieval responses

The full polling chain is visible, teaching the async lifecycle.
