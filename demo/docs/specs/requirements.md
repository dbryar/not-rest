# Requirements Document

## Introduction

- **Context**: The OpenCALL specification defines a self-describing, operation-based API protocol where all interactions flow through a single `POST /call` endpoint. The specification repository contains the protocol documents but lacks a living, interactive demonstration that proves the protocol works end-to-end for real-world use cases.
- **Current State**: The OpenCALL spec exists as documentation only. There is a simple todo API example with tests, but no comprehensive, production-style demo that exercises the full breadth of the protocol — including async operations, chunked retrieval, media redirects, deprecation lifecycle, scope enforcement, and AI agent discovery.
- **Problem Statement**: Developers, API designers, and AI agents need a concrete, working demonstration of the OpenCALL protocol applied to a realistic domain. This demo must showcase every major protocol feature (self-description, sync/async execution, chunked retrieval, media redirects, deprecation, scope-based access control, domain vs protocol errors) through an interactive web application with a split-pane envelope viewer that exposes the raw protocol exchange alongside a human-friendly UI. It must also provide agent discovery mechanisms so AI agents can autonomously interact with the API.
- **Scope**: A library catalog management API (the "OpenCALL Demo Library") implemented in TypeScript with Bun, backed by SQLite and Google Cloud Storage. The demo comprises: an API server implementing 11 operations; a web application server with session management, proxy pattern, and split-pane envelope viewer; a static brochure site; an agent discovery document; seed data generation; usage analytics; and periodic database reset for long-running public deployment.
- **Dependencies**: OpenCALL specification (`specification.md`), Bun runtime, SQLite (`bun:sqlite`), Google Cloud Storage, Zod v4 (schema definition and JSON Schema generation), XState (async operation lifecycle), Firebase Hosting (brochure + agent sites), Cloud Scheduler (periodic reset).

## Glossary

- **Operation**: A named action invoked via `POST /call` with a versioned name like `v1:catalog.list`. Operations are the sole unit of API interaction in OpenCALL.
- **Registry**: The self-description endpoint at `GET /.well-known/ops` that lists all available operations, their argument/result schemas, execution models, auth scopes, and caching policies.
- **Envelope**: The canonical request/response JSON wrapper. Requests use `{ op, args, ctx?, media? }`. Responses use `{ requestId, sessionId?, state, result?, error?, location?, retryAfterMs?, expiresAt? }`.
- **Domain Error**: A business logic error returned as HTTP 200 with `state=error`. Examples: `ITEM_NOT_FOUND`, `OVERDUE_ITEMS_EXIST`. The caller inspects the `state` field, not the HTTP status code, to detect business outcomes.
- **Protocol Error**: A malformed request, unknown operation, or authentication failure returned as HTTP 4xx with `state=error` and a canonical error envelope.
- **Idempotency Key**: A client-supplied key in `ctx.idempotencyKey` that prevents duplicate side effects for mutating operations. The server uses this to return a cached result for repeated calls.
- **Scope**: A string representing a permission grant (e.g. `items:browse`, `patron:read`). Tokens carry a set of scopes; each operation requires specific scopes.
- **Execution Model**: Whether an operation completes synchronously (returning HTTP 200 with the result) or asynchronously (returning HTTP 202 with a polling location).
- **Chunk**: A segment of a large response payload retrieved via `GET /ops/{requestId}/chunks`. Each chunk carries a SHA-256 checksum and a reference to the previous chunk's checksum, forming a verifiable chain.
- **Sunset Date**: The date after which a deprecated operation is removed. Calls after this date receive HTTP 410.
- **Seed Data**: Pre-generated catalog items, patrons, lending records, and cover images loaded at startup and preserved across resets.
- **Patron**: A library user with a card number, lending history, and overdue items. Patrons are created on first authentication.
- **Card Number**: A stable patron identifier in the format `XXXX-XXXX-XX`, used for agent authentication.
- **Split-Pane Envelope Viewer**: A UI component on every API-calling page in the web application that shows the raw request and response envelopes alongside the human-friendly presentation.

## Requirements

### Requirement 1: Spec Compliance (REQ-SPEC)

**User Story:** As an API consumer, I want the demo server to faithfully implement the OpenCALL protocol envelope format, status code mapping, and error semantics, so that I can trust it as a reference implementation of the specification.

#### Acceptance Criteria

##### Request Format

1. The server SHALL accept `POST /call` with `Content-Type: application/json` and a body conforming to the canonical request envelope: `{ op, args, ctx?, media? }`.
2. The `ctx` field SHALL be optional; when omitted, the server SHALL generate a `requestId` (UUID v4) for the response.
3. When `ctx` is present in the request, `ctx.requestId` SHALL be required; the server SHALL return HTTP 400 if `ctx` is present but `ctx.requestId` is missing.
4. When `ctx.sessionId` is present in the request, the server SHALL echo `sessionId` in the response envelope.

##### Response Format

5. Every response SHALL follow the canonical envelope: `{ requestId, sessionId?, state, result?, error?, location?, retryAfterMs?, expiresAt? }`.
6. The fields `result`, `location`, and `error` SHALL be mutually exclusive — at most one SHALL be present, determined by the value of `state`.

##### HTTP Status Code Mapping

7. The server SHALL return HTTP 200 only for synchronous responses with `state=complete` or `state=error` (domain errors).
8. The server SHALL return HTTP 202 for responses with `state=accepted` or `state=pending` (async operations).
9. The server SHALL return HTTP 303 only for redirect responses where `state=complete` and the result is a pre-signed or public URL, and SHALL include the URL in the `Location` HTTP header and in `location.uri` in the response body.
10. The server SHALL return HTTP 400 for malformed envelopes, unknown operations, and schema validation failures, with a canonical error envelope and a server-generated `requestId` if none is parseable from the request.
11. The server SHALL return HTTP 401 for missing, invalid, or expired authentication tokens.
12. The server SHALL return HTTP 403 for valid tokens with insufficient scopes, and SHALL include the names of the missing scopes in the error `cause` field.
13. The server SHALL return HTTP 404 for expired or unknown `requestId` values on `GET /ops/{requestId}` or `GET /ops/{requestId}/chunks`.
14. The server SHALL return HTTP 405 for `GET /call`, and SHALL include an `Allow: POST` header and a JSON error body in the response.
15. The server SHALL return HTTP 410 for deprecated operations past their sunset date, with error code `OP_REMOVED` and a `replacement` field in the error `cause`.
16. The server SHALL return HTTP 429 if a client polls an async operation too frequently, and SHALL include `retryAfterMs` in the response body.
17. The server SHALL return HTTP 500 with a full error payload (canonical envelope with `state=error`) for internal server failures.

##### Error Semantics

18. The server SHALL NOT return zero-information error responses — every error response SHALL include a meaningful `message` field.
19. Business/domain errors (e.g. `ITEM_NOT_FOUND`, `OVERDUE_ITEMS_EXIST`) SHALL be returned as HTTP 200 with `state=error` in the response envelope.
20. Protocol errors (malformed requests, unknown operations, authentication failures) SHALL be returned as HTTP 4xx with `state=error` in the response envelope.
21. Callers SHALL NOT need to inspect HTTP status codes to distinguish business outcomes — the `state` field in the response envelope SHALL be the sole indicator of success, domain error, or protocol error.

---

### Requirement 2: Operation Registry (REQ-REGISTRY)

**User Story:** As an API consumer or developer, I want to discover all available operations, their schemas, execution models, and policies from a single self-description endpoint, so that I can understand the full API contract without external documentation.

#### Acceptance Criteria

##### Registry Endpoint

1. The server SHALL respond to `GET /.well-known/ops` with HTTP 200 and `Content-Type: application/json`.
2. The response body SHALL include `callVersion` as the string `"2026-02-10"` and `operations` as an array of operation descriptors.

##### Operation Completeness

3. The `operations` array SHALL contain exactly 11 entries: `v1:catalog.list`, `v1:catalog.listLegacy`, `v1:item.get`, `v1:item.getMedia`, `v1:item.return`, `v1:item.reserve`, `v1:patron.get`, `v1:patron.history`, `v1:patron.fines`, `v1:catalog.bulkImport`, `v1:report.generate`.

##### Field Completeness

4. Each operation entry SHALL include the following fields: `op`, `argsSchema`, `resultSchema`, `sideEffecting`, `idempotencyRequired`, `executionModel`, `maxSyncMs`, `ttlSeconds`, `authScopes`, `cachingPolicy`.
5. Deprecated operations SHALL additionally include `deprecated: true`, `sunset` (ISO 8601 date string), and `replacement` (the versioned name of the replacement operation).

##### Schema Generation

6. `argsSchema` and `resultSchema` SHALL be valid JSON Schema objects generated from Zod v4 definitions via `z.toJSONSchema()`.
7. The registry SHALL be generated at boot time by introspecting JSDoc annotations and Zod schema exports in `src/operations/*.ts` files.

##### Caching

8. The registry response SHALL include `Cache-Control` and `ETag` headers.
9. When a client sends a conditional request with `If-None-Match` matching the current `ETag`, the server SHALL return HTTP 304 with no body.

---

### Requirement 3: Authentication (REQ-AUTH)

**User Story:** As an API consumer or AI agent, I want to authenticate with the demo library using either a human username flow or an agent card-number flow, so that I receive a scoped bearer token for subsequent API calls.

#### Acceptance Criteria

##### Human Auth (`POST /auth`)

1. The server SHALL accept `POST /auth` with an optional JSON body `{ username?, scopes? }`.
2. When `username` is omitted, the server SHALL generate a username in adjective-animal format (e.g. `"leaping-lizard"`).
3. When `scopes` is omitted, the server SHALL default to `["items:browse", "items:read", "items:write", "patron:read", "reports:generate"]`.
4. The server SHALL strip `items:manage` and `patron:billing` from the requested scopes array — these scopes SHALL NOT be granted to human users.
5. The server SHALL return a JSON response: `{ token, username, cardNumber, scopes, expiresAt }`.
6. The `token` SHALL be prefixed with `demo_` followed by 32 random hexadecimal characters.
7. The `expiresAt` SHALL be set to the current time plus 86400 seconds (24 hours), expressed as a Unix epoch timestamp.
8. If no patron record exists for the given username, the server SHALL create a new patron record as a side effect of authentication.
9. Newly created patrons SHALL be seeded with 2-3 overdue lending records (items that are checked out and past their due date).

##### Agent Auth (`POST /auth/agent`)

10. The server SHALL accept `POST /auth/agent` with a required JSON body `{ cardNumber }`.
11. The `cardNumber` SHALL conform to the format `XXXX-XXXX-XX` where X is an alphanumeric character.
12. The server SHALL return a JSON response: `{ token, username, patronId, cardNumber, scopes, expiresAt }`.
13. The `token` SHALL be prefixed with `agent_` followed by 32 random hexadecimal characters.
14. Agent tokens SHALL carry a fixed set of scopes: `["items:browse", "items:read", "items:write", "patron:read"]`.
15. When `cardNumber` is missing or does not match the required format, the server SHALL return HTTP 400 with error code `INVALID_CARD`.
16. When no patron exists with the given card number, the server SHALL return HTTP 404 with error code `PATRON_NOT_FOUND`.

##### Token Validation

17. Auth middleware SHALL extract the bearer token from the `Authorization` header on every `POST /call` request.
18. The middleware SHALL look up the token in the SQLite database and check its expiry timestamp.
19. When the token is missing, invalid, or expired, the server SHALL return HTTP 401 with a canonical error envelope.
20. When the token is valid and not expired, the middleware SHALL attach the resolved scopes and patron identity to the request context for downstream use.

---

### Requirement 4: Scope Enforcement (REQ-SCOPE)

**User Story:** As an API operator, I want the server to enforce fine-grained scope-based access control on every operation, so that tokens can only access operations their scopes permit.

#### Acceptance Criteria

##### Scope Definitions

1. The system SHALL define 7 scopes: `items:browse`, `items:read`, `items:write`, `items:manage`, `patron:read`, `patron:billing`, `reports:generate`.

##### Scope-to-Operation Mapping

2. The scope `items:browse` SHALL be required for operations `v1:catalog.list` and `v1:catalog.listLegacy`.
3. The scope `items:read` SHALL be required for operations `v1:item.get` and `v1:item.getMedia`.
4. The scope `items:write` SHALL be required for operations `v1:item.reserve` and `v1:item.return`.
5. The scope `items:manage` SHALL be required for operation `v1:catalog.bulkImport`.
6. The scope `patron:read` SHALL be required for operations `v1:patron.get` and `v1:patron.history`.
7. The scope `patron:billing` SHALL be required for operation `v1:patron.fines`.
8. The scope `reports:generate` SHALL be required for operation `v1:report.generate`.

##### Never-Granted Scopes

9. The scopes `items:manage` and `patron:billing` SHALL NOT be granted to any user through any authentication flow — human or agent.
10. Operations requiring `items:manage` (catalog.bulkImport) or `patron:billing` (patron.fines) SHALL always return HTTP 403 for all authenticated users, serving as demonstrations of scope enforcement.

##### Enforcement Behavior

11. The dispatcher SHALL check the required scopes (as declared in the operation registry) against the granted scopes on the authenticated token before dispatching any operation.
12. When a valid token lacks the required scopes, the server SHALL return HTTP 403 with a canonical error envelope that lists the missing scope names in the `cause` field.

---

### Requirement 5: Synchronous Operations (REQ-OPS-SYNC)

**User Story:** As an API consumer, I want to call synchronous library operations (browsing, searching, reserving, returning items, viewing patron data) and receive immediate results, so that I can build responsive applications on top of the OpenCALL protocol.

#### Acceptance Criteria

##### catalog.list

1. The operation `v1:catalog.list` SHALL be synchronous, cacheable, and require the `items:browse` scope.
2. The operation SHALL accept the following optional args: `type` (string), `search` (string), `available` (boolean), `limit` (integer, 1-100, default 20), `offset` (integer, minimum 0, default 0).
3. The operation SHALL return a result containing: `items` (array of objects with `id`, `type`, `title`, `creator`, `year`, `available`, `availableCopies`, `totalCopies`), `total` (integer), `limit` (integer), `offset` (integer).

##### catalog.listLegacy

4. The operation `v1:catalog.listLegacy` SHALL accept the same args and return the same result shape as `v1:catalog.list`.
5. The operation SHALL delegate to the same underlying service as `v1:catalog.list`.
6. The operation SHALL be marked as deprecated with `@deprecated`, `@sunset 2026-06-01`, and `@replacement v1:catalog.list`.
7. The operation SHALL remain callable until its sunset date of 2026-06-01.

##### item.get

8. The operation `v1:item.get` SHALL be synchronous, cacheable, and require the `items:read` scope.
9. The operation SHALL accept a required arg `itemId` (string).
10. The operation SHALL return the full `CatalogItem` record on success.
11. When the requested `itemId` does not exist, the operation SHALL return a domain error with code `ITEM_NOT_FOUND` (HTTP 200, `state=error`).

##### item.getMedia

12. The operation `v1:item.getMedia` SHALL be synchronous, cacheable, and require the `items:read` scope.
13. The operation SHALL accept a required arg `itemId` (string).
14. When the item has a `coverImageKey`, the operation SHALL return HTTP 303 with a `Location` header pointing to a signed GCS URL (1-hour expiry) and `location.uri` in the response body.
15. When the item has no cover image, the operation SHALL return HTTP 200 with `state=complete` and a placeholder value in the result.
16. When the requested `itemId` does not exist, the operation SHALL return a domain error with code `ITEM_NOT_FOUND`.

##### item.return

17. The operation `v1:item.return` SHALL be synchronous, mutating, idempotent, and require the `items:write` scope.
18. The operation SHALL accept a required arg `itemId` (string).
19. On success, the operation SHALL return a result containing: `itemId`, `title`, `returnedAt`, `wasOverdue` (boolean), `daysLate` (integer), `message` (string).
20. The operation SHALL mark the corresponding lending record as returned and increment the item's `availableCopies` count.
21. When the requested `itemId` does not exist, the operation SHALL return a domain error with code `ITEM_NOT_FOUND`.
22. When the item is not currently checked out by the authenticated patron, the operation SHALL return a domain error with code `ITEM_NOT_CHECKED_OUT`.

##### item.reserve

23. The operation `v1:item.reserve` SHALL be synchronous, mutating, idempotent, and require the `items:write` scope.
24. The operation SHALL accept a required arg `itemId` (string).
25. On success, the operation SHALL return a result containing: `reservationId`, `itemId`, `title`, `status` (the string `"pending"`), `reservedAt`, `message` (string).
26. When the authenticated patron has overdue items, the operation SHALL return a domain error with code `OVERDUE_ITEMS_EXIST`, including the overdue `count` and a `hint` suggesting the use of `v1:patron.get` to view overdue items.
27. When the requested `itemId` does not exist, the operation SHALL return a domain error with code `ITEM_NOT_FOUND`.
28. When the item has no available copies, the operation SHALL return a domain error with code `ITEM_NOT_AVAILABLE`.
29. When the patron already has an active reservation for the item, the operation SHALL return a domain error with code `ALREADY_RESERVED`.

##### patron.get

30. The operation `v1:patron.get` SHALL be synchronous, cacheable, and require the `patron:read` scope.
31. The operation SHALL accept no args — the patron identity SHALL be derived from the authenticated token.
32. The operation SHALL return a result containing: `patronId`, `patronName`, `cardNumber`, `overdueItems` (array), `totalOverdue` (integer), `activeReservations` (integer), `totalCheckedOut` (integer).
33. The `overdueItems` array SHALL contain at least 2 entries for newly created patrons (seeded during authentication).

##### patron.history

34. The operation `v1:patron.history` SHALL be synchronous, cacheable, and require the `patron:read` scope.
35. The operation SHALL accept optional args: `limit` (integer), `offset` (integer), `status` (enum: `"active"`, `"returned"`, `"overdue"`).
36. The operation SHALL return a result containing: `patronId`, `records` (array of lending records), `total` (integer), `limit` (integer), `offset` (integer).

##### patron.fines

37. The operation `v1:patron.fines` SHALL be synchronous, cacheable, and require the `patron:billing` scope.
38. Because `patron:billing` is never granted, this operation SHALL always return HTTP 403 for all authenticated users, serving as a demonstration of scope enforcement.

---

### Requirement 6: Asynchronous Operations (REQ-OPS-ASYNC)

**User Story:** As an API consumer, I want to invoke long-running operations (report generation, bulk import) and poll for their results, so that I can handle workflows that cannot complete within a single request-response cycle.

#### Acceptance Criteria

##### report.generate

1. The operation `v1:report.generate` SHALL be asynchronous, mutating, idempotent, and require the `reports:generate` scope.
2. The operation SHALL accept the following args: `format` (enum: `"csv"` or `"json"`, default `"csv"`), `itemType` (string, optional), `dateFrom` (string, optional), `dateTo` (string, optional).
3. The initial response SHALL be HTTP 202 with `state=accepted`, `location.uri` set to `/ops/{requestId}`, `retryAfterMs` set to `1000`, and `expiresAt` set to the current time plus 3600 seconds.
4. Polling at `GET /ops/{requestId}` SHALL return `state=pending` while the report is being generated, with a simulated delay of 3-5 seconds.
5. Upon completion, polling SHALL return `state=complete` with `location.uri` pointing to a signed GCS URL where the report can be downloaded.
6. If generation fails, polling SHALL return `state=error` with a meaningful error message.

##### XState Lifecycle

7. The async operation lifecycle SHALL be managed by an XState state machine with the following transitions: `accepted` → (START) → `pending` → (COMPLETE) → `complete`, or → (FAIL) → `error` at any point.
8. The state machine's current state SHALL be persisted to SQLite after each transition.

##### Report Storage

9. Generated reports SHALL be stored in Google Cloud Storage as synthetic lending history data, approximately 100-500 KB in size.
10. Completed reports SHALL also be available via chunked retrieval at `GET /ops/{requestId}/chunks`.

##### catalog.bulkImport

11. The operation `v1:catalog.bulkImport` SHALL be declared as asynchronous, mutating, and requiring the `items:manage` scope.
12. Because `items:manage` is never granted, this operation SHALL always return HTTP 403 for all authenticated users, serving as a demonstration of scope enforcement on async operations.
13. The operation SHALL appear in the registry as a fully described async mutating operation despite being inaccessible.

---

### Requirement 7: Chunked Retrieval (REQ-CHUNKS)

**User Story:** As an API consumer, I want to retrieve large operation results in verifiable chunks with cursor-based pagination, so that I can download large payloads incrementally and verify their integrity.

#### Acceptance Criteria

##### Endpoint

1. The server SHALL respond to `GET /ops/{requestId}/chunks?cursor=...` with a chunk response conforming to the OpenCALL specification.
2. When `requestId` is not found or has expired, the server SHALL return HTTP 404.

##### Chunk Structure

3. Each chunk SHALL be no larger than 64 KB.
4. Each chunk response SHALL include the following fields: `checksum` (string, format `sha256:{hex}`), `checksumPrevious` (string or null), `offset` (integer), `length` (integer), `mimeType` (string), `total` (integer), `cursor` (string or null), `data` (string).
5. The `checksum` field SHALL contain the SHA-256 hex digest of the chunk's `data` content, prefixed with `sha256:`.
6. The `checksumPrevious` field SHALL contain the SHA-256 hex digest of the previous chunk's `data` content, or `null` for the first chunk.

##### Data Format

7. For CSV and JSON report formats, the `data` field SHALL contain the raw text content (not base64-encoded).

##### Pagination and Completion

8. When more chunks remain, the response SHALL include `state=pending` and a non-null `cursor` for the next chunk.
9. When the final chunk is returned, the response SHALL include `state=complete` and `cursor` SHALL be `null`.

##### Integrity Verification

10. The checksum chain (each chunk referencing the previous chunk's checksum) SHALL enable sequential integrity verification of the entire payload.

---

### Requirement 8: Deprecation Lifecycle (REQ-DEPRECATION)

**User Story:** As an API consumer, I want deprecated operations to remain callable until their sunset date and then return clear removal errors with replacement information, so that I can migrate to new operations on my own schedule.

#### Acceptance Criteria

##### Registry Declaration

1. The operation `v1:catalog.listLegacy` SHALL be declared in the registry with `deprecated: true`, `sunset: "2026-06-01"`, and `replacement: "v1:catalog.list"`.

##### Pre-Sunset Behavior

2. Before the sunset date of 2026-06-01, the operation SHALL remain fully callable and SHALL delegate to the `v1:catalog.list` service implementation.

##### Post-Sunset Behavior

3. On or after the sunset date of 2026-06-01, any call to `v1:catalog.listLegacy` SHALL return HTTP 410 with error code `OP_REMOVED`.
4. The error message SHALL include the name of the removed operation and the sunset date.
5. The error `cause` SHALL include `removedOp` (the deprecated operation name) and `replacement` (the replacement operation name).

---

### Requirement 9: Dashboard App (REQ-APP)

**User Story:** As a demo visitor, I want an interactive web application that lets me browse the library catalog, manage my account, and generate reports — while seeing the raw OpenCALL envelopes for every interaction — so that I can understand both the user experience and the protocol mechanics simultaneously.

#### Acceptance Criteria

##### Auth Flow

1. The app server SHALL redirect `GET /` to `/auth` when no valid session cookie is present.
2. The `/auth` page SHALL display a generated username, scope checkboxes (with defaults checked), and a "Start Demo" button.
3. On form submission, the app server SHALL proxy `POST /auth` to the API server, create a server-side session in SQLite, and set an `HttpOnly`, `Secure`, `SameSite=Lax` session cookie (`sid`).
4. `GET /logout` SHALL clear the server-side session and the session cookie, then redirect to `/auth`.

##### Proxy Pattern

5. The browser SHALL make API calls to the app server at `/api/call` (same-origin), never directly to the API server.
6. The app server SHALL resolve the session from the `sid` cookie, retrieve the stored API token, and forward the request to the API server with an `Authorization: Bearer` header.
7. The proxy SHALL return both the proxied API response and the original request sent (method, URL, headers, body) so the envelope viewer can display both sides.
8. The API token SHALL be masked in the envelope viewer display (e.g. `demo_***`).

##### Split-Pane Envelope Viewer

9. Every page that makes API calls SHALL display a split pane: the left side showing the human-friendly UI and the right side showing the raw JSON envelopes.
10. The envelope viewer SHALL show: request method, URL, headers, and body; response HTTP status, headers, body, and elapsed time in milliseconds.
11. The envelope viewer SHALL provide syntax highlighting, collapsible/expandable sections, and a copy-to-clipboard button.
12. For async operations, the envelope viewer SHALL show the full progression of responses (e.g. 202 → pending → complete).

##### Patron Badge

13. On all authenticated pages, the app SHALL display a patron badge in the top-left corner showing the library card number (in large monospace text) with the username displayed below it.
14. Clicking the patron badge SHALL navigate to the `/account` page.

##### Pages

15. The app SHALL provide the following pages:
    - `/auth` — username input, scope checkboxes, "Start Demo" button.
    - `/` (dashboard) — welcome message, quick links to catalog/account/reports, overdue warning banner if the patron has overdue items, and an agent instructions callout.
    - `/catalog` — search field, type filter, availability toggle, paginated item list powered by `v1:catalog.list`.
    - `/catalog/:id` — item detail powered by `v1:item.get`, cover image display powered by `v1:item.getMedia` (demonstrating the 303 redirect flow), and a reserve button.
    - `/account` — patron card number display, patron details via `v1:patron.get`, overdue items list with return buttons (powered by `v1:item.return`), and lending history via `v1:patron.history`.
    - `/reports` — report generation form (format, filters), generate button triggering `v1:report.generate`, async lifecycle displayed in the envelope viewer, download link on completion, and a chunk viewer demonstrating `GET /ops/{requestId}/chunks`.

##### Scope Error Display

16. When a 403 scope error is returned, the app SHALL display the missing scope names to help the user understand why access was denied.

---

### Requirement 10: Brochure Site (REQ-BROCHURE)

**User Story:** As a visitor, I want a clear, attractive landing page that explains the OpenCALL protocol's purpose and provides paths to the demo, specification, and client guide, so that I can quickly understand the project and try it out.

#### Acceptance Criteria

##### Hosting and Structure

1. The brochure site SHALL be a static single-page site served at `www.opencall-api.com`.
2. The site SHALL be built with plain HTML and CSS — no JavaScript framework SHALL be used.
3. The site SHALL NOT use purple gradients in its design.
4. The site SHALL be deployed via Firebase Hosting configuration.

##### Hero Section

5. The hero section SHALL display XKCD comic 927 ("Standards"), linked to `https://xkcd.com/927/`, with the creator (Randall Munroe / xkcd) properly attributed.
6. The hero section SHALL include the tagline `"Yes, we know. But hear us out."`.
7. The hero section SHALL include a descriptive paragraph and a call-to-action button labeled `"Try the Demo"` that links to `app.opencall-api.com`.

##### Content Sections

8. The site SHALL include the following sections: "The Problem", "The Answer" (with a `POST /call` example), "Try It" (with call-to-action and curl examples), "Compare" (summary comparison table), "Read the Spec" (link to GitHub specification), "Read the Client Guide" (link to GitHub client guide).

##### Footer

9. The footer SHALL include a link to the GitHub repository, a `"Built by one person"` text attribution, and a link to a blog post.

##### Visual Design

10. The site SHALL support dark mode, with the user's preference persisted via a cookie.
11. Code blocks SHALL use monospace fonts.

---

### Requirement 11: Agent Discovery (REQ-AGENTS)

**User Story:** As an AI agent, I want to discover machine-readable instructions for interacting with the OpenCALL Demo Library, so that I can autonomously authenticate, browse the catalog, and manage a patron's account without human-written integration code.

#### Acceptance Criteria

##### Agent Instructions Document

1. A static markdown document SHALL be served at the root of `agents.opencall-api.com`.
2. The document SHALL contain instructions for AI agents including: the authentication flow (ask the user for their library card number, then call `POST /auth/agent`), the list of available operations, a common workflow example, and notes on handling domain errors.
3. The document SHALL be served with `Content-Type: text/markdown` via Firebase Hosting configuration.

##### Discovery Hints in App

4. The app at `app.opencall-api.com` SHALL include a `<meta name="ai-instructions" content="https://agents.opencall-api.com/" />` tag in the HTML `<head>` of every page.
5. The app server SHALL include an `X-AI-Instructions: https://agents.opencall-api.com/` HTTP response header on all responses.
6. The app SHALL respond to `GET /.well-known/ai-instructions` with a redirect to `https://agents.opencall-api.com/`.
7. The app's `robots.txt` SHALL include a comment pointing to `https://agents.opencall-api.com/` as the agent instructions URL.

---

### Requirement 12: Usage Tracking (REQ-ANALYTICS)

**User Story:** As a demo operator, I want to track visitor and agent usage patterns without client-side tracking scripts, so that I can understand how the demo is being used while respecting user privacy.

#### Acceptance Criteria

##### Data Model

1. The system SHALL maintain an `analytics_visitors` table with columns: `id`, `patronId`, `cardNumber`, `username`, `userAgent`, `ip`, `referrer`, `pageViews`, `apiCalls`, `createdAt`, `updatedAt`.
2. The system SHALL maintain an `analytics_agents` table with columns: `id`, `visitorId` (foreign key to `analytics_visitors`), `patronId`, `cardNumber`, `userAgent`, `ip`, `apiCalls`, `createdAt`, `updatedAt`.

##### Visitor Tracking

3. On `POST /auth` (human authentication), the system SHALL upsert an `analytics_visitors` record, matching on the combination of IP address and User-Agent string to detect returning visitors.

##### Agent Tracking

4. On `POST /auth/agent`, the system SHALL look up the associated visitor record by `cardNumber` and insert an `analytics_agents` record linked to that visitor via `visitorId`.

##### Increment Behavior

5. On each proxied page request, the system SHALL perform a fire-and-forget increment of the `pageViews` counter on the matching visitor record.
6. On each `POST /call` proxied through the app, the system SHALL perform a fire-and-forget increment of the `apiCalls` counter on the matching visitor or agent record.

##### Data Integrity

7. Analytics tables SHALL be excluded from database resets — counters SHALL accumulate indefinitely across reset cycles.

##### Privacy

8. The system SHALL NOT use any client-side tracking scripts, tracking cookies, or tracking pixels for analytics purposes.
9. The system SHALL NOT expose any analytics data through client-accessible API endpoints.

---

### Requirement 13: Database Reset (REQ-RESET)

**User Story:** As a demo operator, I want the demo database to reset periodically so that the system stays clean for new visitors, while preserving seed data and accumulated analytics.

#### Acceptance Criteria

##### Reset Triggers

1. The system SHALL perform an automatic database reset every 4 hours, triggered by Cloud Scheduler.
2. The system SHALL support a manual reset via `POST /admin/reset` authenticated with a shared secret.

##### Data That Resets

3. A reset SHALL wipe: all authentication tokens, all app sessions, all non-seed patron records, all modified lending records (restoring seed lending records to their original state), all reservations, and all async operation records.

##### Data That Persists

4. A reset SHALL preserve: seed patron records (~50), catalog items (~200), seed lending records (~5000), all analytics table data, and all objects stored in Google Cloud Storage.

##### User Experience After Reset

5. After a reset, all active sessions SHALL be invalidated — the next API call from an existing session SHALL return HTTP 401.
6. Upon receiving a 401 after reset, the app SHALL redirect the user to `/auth`.
7. The `/auth` page SHALL be capable of displaying a `"The demo has been reset"` banner to inform users.

---

### Requirement 14: Seed Data (REQ-SEED)

**User Story:** As a demo operator, I want the system pre-loaded with realistic library data (catalog items, patrons, lending records, and cover images) so that every visitor encounters a rich, believable demo from the moment they authenticate.

#### Acceptance Criteria

##### Catalog Items

1. The seed data SHALL include approximately 200 catalog items.
2. Book items SHALL use real metadata sourced from the Open Library API (titles, authors, publication years, ISBNs).
3. Non-book items (CDs, DVDs, board games) SHALL be generated using faker with plausible metadata.

##### Cover Images

4. Approximately 50 cover images SHALL be downloaded from the Open Library Covers API and stored in Google Cloud Storage.
5. Catalog items without a downloaded cover image SHALL reference a placeholder image.

##### Patrons

6. The seed data SHALL include approximately 50 pre-seeded patron records with faker-generated names and stable card numbers in the format `XXXX-XXXX-XX`.

##### Lending Records

7. The seed data SHALL include approximately 5000 lending records distributed across the patron population.
8. Each lending record SHALL include: `checkoutDate`, `dueDate` (14 days after `checkoutDate`), `returnDate` (`null` if the item is still checked out), and `daysLate` (calculated from `dueDate` to current date or `returnDate`).

##### Overdue Seeding

9. Every seed patron SHALL have at least 2 overdue items — lending records where `returnDate` is `null` and `daysLate` is greater than 0.
10. This overdue seeding SHALL ensure the `v1:item.reserve` → `OVERDUE_ITEMS_EXIST` error scenario is always demonstrable for any authenticated patron.

##### Item Availability

11. Each catalog item SHALL have a `totalCopies` value randomly assigned between 1 and 5.
12. Each catalog item SHALL have an `availableCopies` value randomly assigned between 0 and `totalCopies`.

##### Referential Integrity

13. Overdue items in lending records SHALL reference real catalog items so that agents and users can look them up via `v1:item.get`.
