# Goodbye REST. Hello CALL.

**CALL** — Command And Lifecycle Layer — is an API specification designed for a world where humans and AI agents are equal consumers of your services.

REST was built for human developers. MCP was built for agents. CALL replaces both with a single operation-based protocol that serves everyone.

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
  "op": "order.getItem",
  "args": { "orderId": "456", "itemId": "789" },
  "ctx": { "requestId": "..." }
}
```

That's it. A human developer can read it. An agent can call it. The operation name carries the intent. The registry describes what's available. No verb mapping, no resource nesting, no translation.

## What CALL Supports

- **Three execution models** — synchronous, asynchronous (poll-based), and streaming (push-based for sensors, video, telemetry)
- **Transport-agnostic core** — HTTP(S), WebSocket, MQTT, Kafka, WebRTC, QUIC. The envelope is the contract, not the wire protocol
- **Media ingress and egress** — browsers upload files via native multipart; agents use pre-signed URIs. Large media redirects via 303, never proxied
- **Session correlation** — `sessionId` and `parentId` for application-level grouping; `traceparent` for infrastructure observability
- **Data integrity** — mandatory chunk checksums with chain validation; optional frame integrity for safety-critical streams
- **Self-describing** — `GET /.well-known/ops` returns the full operation registry with schemas, execution models, and constraints. Agents ground themselves. Clients generate themselves
- **Transport-aware auth** — HTTP uses headers, MQTT/Kafka use envelope auth, QUIC uses built-in TLS. One auth model, transport-specific enforcement

## Read the Spec

The full specification is in [`specification.md`](specification.md).

## Origin

This started with a [blog post](https://daniel.bryar.com.au/posts/2026/02/goodbye-rest-hello-cqrs/) arguing that REST doesn't work for agentic interaction. The spec is the answer to the question that post asked.

## Contribute

This is one person's answer to a problem that affects everyone building APIs in 2026. It will only get better with input from others.

- Open an [issue](../../issues) to discuss ideas or problems
- Submit a PR to propose changes to the spec
- Star the repo if this resonates

No more first and second class audiences. No more REST.
