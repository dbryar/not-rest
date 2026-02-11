# Goodbye REST. Hello OpenCALL.

**OpenCALL** — Open Command And Lifecycle Layer — is an API specification designed for a world where humans and AI agents are equal consumers of your services.

REST optimizes around resource modeling and HTTP semantics, which work well for human-designed clients but map awkwardly to agent-style invocation. MCP was built for agents often to translate intent to actionable requests. OpenCALL replaces both with a single operation-based protocol that serves everyone.

## The Problem

REST maps intent to resource hierarchies and HTTP verbs. That translation layer exists purely because REST was designed for people. Agents don't think in `GET /users/123/orders/456/items/789` — they think in operations: *"get this order item."*

So we built MCP for agents and kept REST for humans. Now you're maintaining two contracts for two audiences over the same business logic.

## The Answer

One endpoint. One envelope. One contract.

```
POST /call
```

```json
{
  "op": "v1:orders.getItem",
  "args": { "orderId": "456", "itemId": "789" },
  "ctx": { "requestId": "..." }
}
```

That's it. A human developer can read it. An agent can call it. The operation name carries the intent. The registry describes what's available. No verb mapping, no resource nesting, no translation.

## What OpenCALL Supports

- **Three execution models** — synchronous, asynchronous (poll-based), and streaming (push-based for sensors, video, telemetry)
- **Transport-agnostic core** — HTTP(S), WebSocket, MQTT, Kafka, WebRTC, QUIC. The envelope is the contract, not the wire protocol
- **Media ingress and egress** — browsers upload files via native multipart; agents use pre-signed URIs. Large media redirects via 303, never proxied
- **Session correlation** — `sessionId` and `parentId` for application-level grouping; `traceparent` for infrastructure observability
- **Data integrity** — mandatory chunk checksums with chain validation; optional frame integrity for safety-critical streams
- **Self-describing** — `GET /.well-known/ops` returns the full operation registry with schemas, execution models, and constraints. Agents ground themselves. Clients generate themselves
- **Versioned operations** — version-prefixed names (`v1:orders.getItem`), additive-first evolution rules, and a deprecation lifecycle with contractual sunset dates
- **Transport-aware auth** — HTTP uses headers, MQTT/Kafka use envelope auth, QUIC uses built-in TLS. One auth model, transport-specific enforcement

## Example Implementations

The [`tests/`](tests/) directory contains a language-agnostic test suite and reference API implementations. The test suite validates any implementation against the OpenCALL contract via HTTP.

**Quick start (TypeScript):**

```bash
cd tests && bun install && bun test
```

**Docker:**

```bash
docker compose -f tests/docker/docker-compose.yml up --build -d

# Test any implementation — setup auto-registers auth tokens
API_URL=http://localhost:3001 bun test --cwd tests  # TypeScript
API_URL=http://localhost:3002 bun test --cwd tests  # Python
API_URL=http://localhost:3003 bun test --cwd tests  # Java
API_URL=http://localhost:3004 bun test --cwd tests  # Go
```

See [`tests/README.md`](tests/README.md) for details on running tests, adding new language implementations, and the test architecture.

## Read More

The full specification is in [`specification.md`](specification.md). For what this means on the client side — and why your REST SDK is apology code — see [`client.md`](client.md). For how OpenCALL compares to JSON-RPC, GraphQL, gRPC, SOAP, MCP, A2A, and others — see [`comparisons.md`](comparisons.md).

## Origin

This started with a [blog post](https://daniel.bryar.com.au/posts/2026/02/goodbye-rest-hello-cqrs/) arguing that REST doesn't work for agentic interaction. The spec is the answer to the question that post asked.

## Contribute

This is one person's answer to a problem that affects everyone building APIs in 2026. It will only get better with input from others.

- Open an [issue](../../issues) to discuss ideas or problems
- Submit a PR to propose changes to the spec
- Star the repo if this resonates

No more first and second class audiences. No more REST.
