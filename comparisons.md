# How CALL Compares

CALL overlaps with many things but replaces none of them wholesale. It shares structural DNA with JSON-RPC, architectural instincts with SOAP, and ambition with MCP. The question for each is the same: does it serve both humans and agents with one contract, across transports, with a built-in lifecycle?

---

## JSON-RPC

JSON-RPC is CALL's closest structural ancestor. Same spirit: a method name, a params object, an envelope, transport-agnostic by design. If you look at a CALL request and think "that's JSON-RPC," you're not wrong — you're just not seeing the rest.

JSON-RPC deliberately limits its scope. The spec says so: "It is transport agnostic in that the concepts can be used within the same process, over sockets, over http, or in many various message passing environments. It uses JSON (RFC 4627) as data format." That's the entire ambition — a thin envelope for method dispatch.

What JSON-RPC does not define:

- **Lifecycle.** No `accepted → pending → complete` state progression. No async polling. No way to say "I got your request, it's running, check back later." You send a request; you get a response or an error. Everything is synchronous at the protocol level.
- **Self-description.** Explicitly out of scope. There is no registry, no schema advertisement, no `/.well-known/ops`. A caller must know the method signatures through external documentation.
- **Auth.** No authentication model. Not in the envelope, not in the spec, not anywhere. Left entirely to the transport.
- **Media.** No concept of binary attachments, file uploads, or media references. The envelope is JSON; if you need to send a file, you're on your own.
- **Context propagation.** No `requestId`, `sessionId`, `idempotencyKey`, or `traceparent`. Correlation is the caller's problem.
- **Streaming.** No streaming model. JSON-RPC has notifications (one-way messages), but no concept of subscribing to a continuous data feed with transport negotiation.
- **Transport bindings.** Despite being "transport-agnostic," JSON-RPC defines no transport bindings. How does auth work over HTTP vs MQTT? How do you handle streaming over WebSocket vs QUIC? The spec is silent.
- **Error model.** Integer error codes with a message string. The `-32xxx` range is reserved for protocol errors, leaving application errors to ad-hoc conventions. No structured `cause`, no domain error semantics.

JSON-RPC is the envelope. CALL is the envelope plus the lifecycle, registry, auth, streaming, media, and transport bindings.

---

## GraphQL

GraphQL is genuinely good at what it was built for: letting a client specify exactly what data it wants from a rich, interconnected data graph. The schema is strong, introspection is built in, and the single-endpoint model avoids REST's URL proliferation. If your problem is "I want different shapes of the same data depending on who's asking," GraphQL is a precise solution.

But GraphQL's strengths are also its constraints.

**Query-centric, not operation-centric.** Queries are first-class citizens. Mutations exist but feel bolted on — they share the query syntax without sharing the query semantics. There's no lifecycle for a mutation. You fire it and get a result. If the mutation takes thirty seconds, you wait thirty seconds. There's no `accepted → pending → complete` progression, no polling, no "check back later."

**Subscriptions are transport-coupled.** GraphQL subscriptions require a persistent connection, almost always WebSocket. There's no subscription model for MQTT, Kafka, QUIC, or any other transport. If your data feed comes from an IoT device over MQTT, GraphQL subscriptions don't help.

**Not agent-friendly.** A GraphQL query requires the caller to specify exactly which fields it wants from a potentially deep and interconnected schema. For a human developer with IDE autocomplete, this is powerful. For an LLM, it's a combinatorial problem. The agent must understand the full schema graph and construct a valid field selection. In practice, agents either request everything (defeating the purpose) or need hardcoded query templates (defeating the flexibility).

**N+1 at the resolver layer.** GraphQL moves the N+1 problem from the client to the server. DataLoader and batching mitigate it, but the resolver architecture means every field is a potential database call. This is an implementation concern, not a protocol flaw, but it shapes what's practical.

**No native media handling.** GraphQL has no concept of file uploads in the spec. The community `graphql-upload` convention exists but is not standardized and has been deprecated by its creator. Binary data in GraphQL is base64 strings or a side-channel upload — never a first-class part of the operation.

**HTTP-bound in practice.** The spec is theoretically transport-agnostic, but the ecosystem assumes HTTP POST with a JSON body. Subscriptions assume WebSocket. Running GraphQL over MQTT or Kafka is not a real pattern.

GraphQL solves "I want different shapes of the same data." CALL solves "I want to invoke an operation and track its lifecycle."

---

## gRPC

gRPC is a serious protocol for serious service-to-service communication. Protobuf schemas are rigorous, code generation is mature across dozens of languages, and the four streaming modes (unary, server-streaming, client-streaming, bidirectional) cover the full range of interaction patterns. For backend microservices that need performance and type safety, gRPC delivers.

The constraints show up at the edges.

**Not browser-native.** gRPC requires HTTP/2 trailers, which browsers don't expose. gRPC-Web exists as a proxy layer but supports only unary and server-streaming — no client-streaming or bidirectional. The browser story is always mediated.

**Not agent-friendly.** Protobuf is a binary format. An LLM cannot read a `.proto` file at runtime and construct a valid binary request. Agents need compiled stubs or a JSON transcoding layer. gRPC does support JSON transcoding (via `google.api.http` annotations), but it's an add-on, not the default path — and it produces REST-shaped endpoints, which brings you back to the problems REST already has.

**No operation-level metadata.** A protobuf service definition declares RPC signatures — input message, output message, streaming mode. It does not declare execution model (sync vs async vs streaming), idempotency requirements, auth scopes, media schemas, caching policy, or whether the operation is side-effecting. That metadata lives outside the schema, in documentation or middleware.

**Transport-locked to HTTP/2.** gRPC's wire format is specified over HTTP/2. There is no standard gRPC binding for MQTT, Kafka, WebSocket, or QUIC. If your devices speak MQTT, gRPC is not an option without a gateway.

**Related binary RPC frameworks.** The landscape includes several alternatives with similar trade-offs:

- **Thrift** (Meta) — Similar to gRPC but with declining adoption. Supports multiple serialization formats but lacks streaming and has a smaller modern ecosystem.
- **Twirp** (Twitch) — Simpler than gRPC, works over HTTP 1.1, no streaming. A pragmatic choice that accepts smaller scope.
- **Connect** (Buf) — The closest to CALL's philosophy in this category. Browser-compatible, supports streaming, works over HTTP 1.1 and 2. But still protobuf-first, no operation registry, no lifecycle model, no transport bindings beyond HTTP.
- **Cap'n Proto** — Zero-copy serialization with RPC. Exceptional performance for specific use cases. Niche adoption.

Binary RPC frameworks optimize for service-to-service performance. CALL optimizes for universal accessibility — JSON, any transport, any caller.

---

## SOAP

SOAP is the comparison nobody wants to make and everybody is thinking. Operation-based? Envelope-wrapped? Self-describing via WSDL? Transport-agnostic in theory? That's CALL's architecture. The resemblance is not a coincidence — SOAP got the shape right.

**What SOAP got right — and CALL keeps:**

- Operations, not resources. You call `PlaceOrder`, not `POST /orders`.
- Single endpoint. No URL hierarchy to map.
- Self-describing contract. WSDL told you everything about the service — operations, types, bindings.
- Canonical envelope. Every request and response had the same wrapper structure.
- Transport-agnostic ambition. SOAP bindings existed for HTTP, SMTP, JMS, and others.

**What killed SOAP:**

- **XML everywhere.** Verbose, hard to parse in browsers, hostile to dynamic languages. The envelope overhead dwarfed the payload for simple operations.
- **WS-\* complexity explosion.** WS-Security, WS-ReliableMessaging, WS-Addressing, WS-Federation, WS-Trust, WS-Policy, WS-AtomicTransaction... Each spec added another namespace, another header block, another reason to abandon the whole stack. The composability was theoretical; the complexity was real.
- **WSDL was machine-readable, not human-readable.** A WSDL document was XML describing XML. Developers didn't read WSDLs — they fed them to code generators and hoped the output was usable.
- **No streaming or async lifecycle.** SOAP was synchronous request-response. WS-Addressing added correlation headers for async, but there was no built-in lifecycle progression. No `state` field. No polling. No streaming subscriptions.
- **Browser-hostile.** Constructing SOAP envelopes in JavaScript was painful. Parsing XML responses was painful. The browser ecosystem moved to JSON and never looked back.
- **No agent story.** SOAP predated the agent era, but its architecture could have served agents well — if the wire format hadn't been XML and the spec stack hadn't been impenetrable.

CALL is SOAP's architecture with JSON, a sane auth model, built-in async/streaming lifecycle, and no WS-\* stack.

---

## MCP

The Model Context Protocol is purpose-built for LLM-to-tool integration, and it does that job cleanly. The tool/resource/prompt primitives map well to how agents think. The ecosystem is growing fast. If your only question is "how does an agent call my service," MCP is a reasonable answer today.

The problem is that it's only half the answer.

**Agent-only.** MCP has no story for human-facing clients. There's no browser integration path, no UI binding, no concept of a frontend consuming the same contract. If you adopt MCP for agents and keep REST for humans, you're maintaining two protocols over the same business logic — the exact problem CALL exists to solve.

**Limited transport model.** MCP defines HTTP with SSE for streaming (the Streamable HTTP transport), with the original stdio transport for local processes. The SSE-based streaming approach was adopted after the initial SSE transport was deprecated within months of release — a sign of a transport model still finding its footing.

**No async lifecycle.** MCP tools return results. There is no `accepted → pending → complete` state progression. No long-running operation tracking. No polling. If a tool invocation takes thirty seconds, the agent waits thirty seconds.

**No media model.** MCP has no concept of binary attachments, file uploads, media references, or multipart payloads. Sending an image to an MCP tool means base64-encoding it into a text argument.

**No continuous streaming.** MCP's notifications are server-initiated messages, but there's no subscription model for continuous data feeds — sensor telemetry at 100Hz, video frames, position tracking. The protocol handles request-response and notifications, not persistent data streams.

**No chunk integrity.** No checksums, no chain validation, no data integrity mechanism for large result retrieval.

**Rapid spec evolution.** The specification is still changing quickly. The original SSE transport was deprecated in favor of Streamable HTTP. Authorization is in draft. The registry concept (tool listing) is simpler than CALL's operation registry — no execution model declaration, no media schemas, no streaming transport negotiation.

MCP solves "how does an agent call a tool." CALL solves "how does anyone — agent or human — invoke an operation across any transport."

---

## A2A

Google's Agent-to-Agent protocol addresses a real gap: how do autonomous agents delegate tasks to each other? A2A brings Agent Cards for discovery, a task lifecycle with state progression (`submitted → working → input-required → completed → failed`), and a JSON-RPC 2.0 wire format. With 150+ organizations under the Linux Foundation, it has serious institutional backing.

The scope is deliberately narrow.

**Agent-to-agent only.** A2A defines how agents talk to agents. There is no human-facing client story. No browser integration. No UI binding. A2A assumes the caller is an agent and the callee is an agent.

**Inherits JSON-RPC limitations.** A2A chose JSON-RPC 2.0 as its wire format, inheriting the constraints described [above](#json-rpc): no media model, primitive error codes, no transport bindings, no self-describing operation schemas beyond Agent Cards.

**Complementary to MCP, not a replacement.** A2A's own positioning is that it complements MCP: MCP handles agent-to-tool, A2A handles agent-to-agent. This means an organization building for the full landscape needs REST for humans, MCP for agent-to-tool, and A2A for agent-to-agent. Three protocols, three contracts, three integration surfaces.

**HTTP-only.** A2A defines HTTP as its transport. There are no bindings for WebSocket, MQTT, Kafka, or QUIC.

A2A + MCP + REST = three protocols. CALL = one.

---

## OpenAPI and API Description Languages

These tools describe APIs. They are invaluable for documentation, code generation, and contract testing. They are not invocation protocols.

### OpenAPI

The industry standard for REST API description. Massive tooling ecosystem — Swagger UI, code generators for every language, validation middleware, mock servers. If you have a REST API, you should have an OpenAPI spec.

But OpenAPI describes REST; it doesn't fix REST. The generated SDK still maps classes to URL segments, methods to HTTP verbs, IDs to path parameters. The spec is a static artifact — a YAML or JSON file checked into a repo. It can drift from the implementation. It can be wrong. It can be out of date. And the codegen output is the REST SDK problem described in [`client.md`](client.md) — hundreds of generated classes that exist solely to reconstruct URLs.

OpenAPI is HTTP-only. There is no standard way to describe an MQTT or Kafka binding in an OpenAPI spec.

### AsyncAPI

OpenAPI for event-driven architectures. Describes message-driven systems across AMQP, MQTT, Kafka, WebSocket, and others. Fills a real gap — before AsyncAPI, event-driven APIs had no standard description format.

But AsyncAPI is a description format, not a protocol. It tells you what messages look like and where they go. It doesn't define an invocation model, a lifecycle, or a registry endpoint.

### Smithy

AWS's protocol-agnostic interface definition language. Separates the API model from the protocol binding — a Smithy model can generate clients for REST, gRPC, or any other protocol. The design philosophy is sound and could theoretically generate CALL clients. Smithy is complementary, not competing.

**The common gap:** these tools describe APIs as external artifacts. CALL's [registry](specification.md#self-description-endpoint) IS the API description, served live by the application itself at `GET /.well-known/ops`. No artifact to drift. No version to pin. The contract is always current because the contract is the running service.

---

## CloudEvents

CloudEvents is a CNCF graduated specification for describing events in a common way. It defines a standard envelope with required attributes (`id`, `source`, `type`, `specversion`) and optional extensions. Protocol bindings exist for HTTP, Kafka, AMQP, MQTT, and NATS. Adoption is broad across cloud infrastructure.

CloudEvents standardizes "something happened." It is a notification format, not an invocation protocol. There is no request-response model. No lifecycle. No registry. No streaming subscriptions. No auth model. No operation schemas.

CALL and CloudEvents operate at different layers. A CALL operation could emit CloudEvents as side effects. A CloudEvents consumer could trigger CALL invocations. They are complementary.

CloudEvents standardizes event notifications. CALL standardizes operation invocations.

---

## Real-Time Transports

These are pipes, not protocols. They define how bytes move between endpoints. CALL defines what flows through the pipe.

**SSE (Server-Sent Events)** — Simple, browser-native, server-to-client text streaming over HTTP. No binary support. No bidirectional communication. No RPC semantics. MCP's adoption and subsequent deprecation of its SSE transport illustrates the limitation: SSE works for simple notification streams but buckles under the weight of a full protocol.

**Socket.IO** — Developer-friendly real-time communication library. Automatic reconnection, rooms, namespaces, fallback transports. But it's a library with proprietary framing, JavaScript-centric, and not interoperable across ecosystems. A communication library, not an API protocol.

**WAMP (Web Application Messaging Protocol)** — Unified RPC and PubSub over WebSocket through a router. Architecturally interesting — the router-mediated model enables clean separation. But router-dependency adds infrastructure complexity, and the ecosystem remains small.

**WebTransport** — Modern HTTP/3 transport supporting bidirectional streams, datagrams, and multiplexing without head-of-line blocking. This is what a CALL [QUIC binding](specification.md#quic-binding) could use underneath. It's a transport mechanism, not an application protocol.

These are transports. CALL defines what flows through the transport — the [envelope](specification.md#invocation-request-envelope), the [lifecycle](specification.md#execution-models), the [registry](specification.md#self-description-endpoint).

---

## Patterns Often Confused with Protocols

These are architectural patterns or conventions, not wire protocols. They operate at a different layer than CALL.

**CQRS (Command Query Responsibility Segregation)** — A backend architectural pattern that separates read and write models. CALL is CQRS-compatible by design: the caller doesn't distinguish command from query; the `op` name carries intent and the server routes internally. A CALL server can implement CQRS without the caller knowing or caring. Different layers.

**HATEOAS (Hypermedia as the Engine of Application State)** — The "pure REST" ideal where responses contain links to available actions, enabling clients to navigate the API by following hyperlinks. The theory is elegant. In practice, it was broadly rejected — no working generic HATEOAS client exists that can navigate an arbitrary API without prior knowledge. HATEOAS is response-level discovery; CALL provides [catalog-level discovery](specification.md#self-description-endpoint) via `/.well-known/ops`, where every operation and its schema are available upfront.

**OData** — Standardized REST conventions with a query language for filtering, sorting, and paging. Adds consistency to REST APIs, particularly in the Microsoft and SAP ecosystems. But it inherits all of REST's limitations — HTTP-only, resource-oriented, verb-mapped — and adds its own complexity. Limited adoption outside enterprise environments.

---

## LLM Function Calling

OpenAI's function calling, Anthropic's tool use, Google's function declarations — these are vendor-specific formats for describing callable tools to a specific LLM. They define the shape of a tool description (name, description, parameters as JSON Schema) and how the model generates a structured call.

These formats define how an LLM selects and parameterizes a function call. They do not define how that call is transmitted to a service, how the service responds, how long-running operations are tracked, or how streams are established. The LLM generates `{"name": "get_weather", "arguments": {"city": "Sydney"}}` — but something still needs to deliver that call to a service and handle the response lifecycle.

LLM function calling is tool selection. CALL is [service invocation](specification.md#operation-invocation-endpoint). A CALL [registry](specification.md#self-description-endpoint) can feed LLM function calling directly — the operation schemas at `/.well-known/ops` are JSON Schema, exactly what these formats consume. The LLM picks the operation; CALL delivers it.
