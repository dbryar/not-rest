# Project Brief: OpenCALL Demo — Public Lending Library

## Goal

Build a convincing **demo application** that implements the **OpenCALL v1.0** spec as a working system. The demo domain is a **public lending library** — patrons browse a catalog of physical items (books, CDs, DVDs, board games), view item details, retrieve cover images, return overdue items, reserve items for pickup, and generate lending-history reports.

The demo is split across four subdomains:

| Domain                    | Purpose                                       | Hosting                                         |
| ------------------------- | --------------------------------------------- | ----------------------------------------------- |
| `www.opencall-api.com`    | Brochure/marketing site — explains the spec   | Firebase Hosting (static)                       |
| `app.opencall-api.com`    | Demo app — interactive library dashboard      | Cloud Run (Bun, serves HTML + handles sessions) |
| `api.opencall-api.com`    | OpenCALL API server — the spec implementation | Cloud Run (Bun, pure API)                       |
| `agents.opencall-api.com` | Agent instructions — markdown for LLMs        | Firebase Hosting (static)                       |

Four audiences:

1. **Visitors** to `www.opencall-api.com` — learn what OpenCALL is, click "Try the Demo" (CTA) to go to the app.
2. **Developers** using `api.opencall-api.com` directly — hit the API with curl/Postman, read `/.well-known/ops`, see the lifecycle in action.
3. **Demo users** on `app.opencall-api.com` — interactive dashboard that calls the API and **shows the raw request/response envelopes** alongside the UI results, so visitors can see exactly how the protocol works.
4. **AI agents** (Claude, GPT, etc.) — directed to `agents.opencall-api.com` via standard mechanisms, where they find plain-text instructions for authenticating with a library card number, calling the API, and discovering operations. The agent can then autonomously browse the catalog, return overdue items, reserve items, and encounter domain errors — all through the same API the humans use.

### API endpoints (`api.opencall-api.com`)

- `POST /call` — operation invocation (the only write endpoint)
- `GET /call` — 405 Method Not Allowed with `Allow: POST` header and error body per spec
- `GET /.well-known/ops` — operation registry (self-description)
- `GET /ops/{requestId}` — async operation polling
- `GET /ops/{requestId}/chunks?cursor=...` — chunked result retrieval
- `POST /auth` — mint a demo token for human users (returns token + metadata)
- `POST /auth/agent` — mint an agent token using a library card number (returns token with fixed agent scopes)

### App endpoints (`app.opencall-api.com`)

- `GET /` — dashboard (requires auth, redirects to `/auth` if no session)
- `GET /auth` — auth page (pick username, select scopes, mint token)
- `POST /auth` — proxies to `api.opencall-api.com/auth`, stores token in server-side session, sets `sid` cookie
- `GET /logout` — clears session + cookie

---

## Non-goals / hard constraints

- **No user-supplied uploads.** No `media` ingress of any kind. The demo catalog is curated and pre-seeded. This is a read-heavy demo with one async write operation (report generation).
- **No streaming operations.** The demo covers sync and async execution models only. Stream subscriptions are out of scope.
- **No real auth system.** Demo tokens are minted via simple endpoints. No OAuth, no passwords. The app uses a server-side session + cookie to hold the token, but the API itself is pure bearer token auth.
- **No HTTP boundary caching via `GET /call`.** `/call` is POST only, per spec.
- **Keep compute small.** Report generation simulates work with a delay, not actual heavy processing.

---

## Tech stack

| Layer              | Technology                             | Notes                                                                    |
| ------------------ | -------------------------------------- | ------------------------------------------------------------------------ |
| Runtime            | **Bun**                                | Fast startup, native TS, ideal for Cloud Run scale-to-zero               |
| HTTP server        | **Bun.serve()**                        | Native route handling, no framework dependency                           |
| State machine      | **XState v5**                          | Operation instance lifecycle                                             |
| Database           | **SQLite via `bun:sqlite`**            | Catalog, operation state, auth tokens, sessions. Single file, zero infra |
| Object storage     | **Google Cloud Storage**               | Cover images, generated reports. Free tier: 5 GB                         |
| Hosting (API)      | **Google Cloud Run**                   | `api.opencall-api.com` — scale to zero, free tier: 2M req/month          |
| Hosting (App)      | **Google Cloud Run**                   | `app.opencall-api.com` — serves HTML dashboard + handles sessions        |
| Hosting (Brochure) | **Firebase Hosting**                   | `www.opencall-api.com` — static site, free tier: 1 GB + 10 GB            |
| Hosting (Agent)    | **Firebase Hosting**                   | `agents.opencall-api.com` — static markdown, same free tier              |
| Seed data          | **Open Library API** (CC0) + **faker** | Real book metadata + synthetic lending history                           |
| Testing            | **bun test**                           | Integration tests against the running server                             |

### Why this stack

- **Zero cost when idle.** Cloud Run bills per-request (not per-instance). SQLite is a file. GCS free tier covers the demo. Firebase Hosting is free for static content.
- **Scales if it goes viral.** Cloud Run auto-scales. GCS handles burst reads. SQLite is the only bottleneck, and for a read-heavy demo it's more than sufficient.
- **Simple to deploy.** One Dockerfile, one `gcloud run deploy`, one `firebase deploy`.

---

## Project structure

```
demo/
├── api/                               # === api.opencall-api.com ===
│   ├── src/
│   │   ├── server.ts                  # Bun.serve() entry point, route table
│   │   ├── call/
│   │   │   ├── dispatcher.ts          # POST /call command interpreter
│   │   │   ├── envelope.ts            # Request/response envelope types + validation
│   │   │   └── errors.ts             # Error constructors (domain + protocol)
│   │   ├── ops/
│   │   │   ├── registry.ts            # Build + serve the operation registry
│   │   │   ├── polling.ts             # GET /ops/{requestId} handler
│   │   │   └── chunks.ts             # GET /ops/{requestId}/chunks handler
│   │   ├── auth/
│   │   │   ├── tokens.ts              # Token minting + validation
│   │   │   ├── scopes.ts              # Scope definitions + enforcement
│   │   │   └── middleware.ts          # Auth extraction from Authorization header
│   │   ├── operations/
│   │   │   ├── catalog-list.ts        # v1:catalog.list (sync)
│   │   │   ├── catalog-list-legacy.ts # v1:catalog.listLegacy (deprecated → v1:catalog.list)
│   │   │   ├── item-get.ts            # v1:item.get (sync)
│   │   │   ├── item-get-media.ts      # v1:item.getMedia (sync)
│   │   │   ├── item-reserve.ts        # v1:item.reserve (sync, mutating)
│   │   │   ├── item-return.ts         # v1:item.return (sync, mutating)
│   │   │   ├── patron-get.ts          # v1:patron.get (sync)
│   │   │   ├── patron-history.ts      # v1:patron.history (sync)
│   │   │   ├── patron-fines.ts        # v1:patron.fines (sync) — requires patron:billing
│   │   │   ├── catalog-bulk-import.ts # v1:catalog.bulkImport (async) — requires items:manage
│   │   │   └── report-generate.ts     # v1:report.generate (async)
│   │   ├── services/
│   │   │   ├── catalog.ts             # Catalog queries (SQLite)
│   │   │   ├── media.ts               # GCS signed URL generation
│   │   │   ├── reports.ts             # Synthetic report generation + storage
│   │   │   ├── lending.ts             # Lending operations (return, reserve, overdue checks)
│   │   │   ├── lifecycle.ts           # XState machine + state persistence
│   │   │   └── analytics.ts           # Visitor/agent tracking (fire-and-forget writes)
│   │   └── db/
│   │       ├── schema.sql             # SQLite schema (catalog, operations, tokens)
│   │       ├── seed.ts                # Seed catalog from Open Library + faker
│   │       ├── reset.ts               # Reset DB to seed state (periodic maintenance)
│   │       └── connection.ts          # bun:sqlite connection setup
│   ├── tests/
│   │   ├── call.test.ts               # POST /call integration tests
│   │   ├── registry.test.ts           # GET /.well-known/ops tests
│   │   ├── polling.test.ts            # Async lifecycle + polling tests
│   │   ├── chunks.test.ts             # Chunked retrieval tests
│   │   ├── auth.test.ts               # Auth flow tests
│   │   └── errors.test.ts             # Error envelope + status code tests
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
│
├── app/                               # === app.opencall-api.com ===
│   ├── src/
│   │   ├── server.ts                  # Bun.serve() entry point — serves HTML + API proxy
│   │   ├── session.ts                 # Session store (SQLite) + cookie handling
│   │   ├── auth.ts                    # GET /auth page, POST /auth → mint + store session
│   │   └── proxy.ts                   # Proxies /call etc. to api.opencall-api.com with token from session
│   ├── views/
│   │   ├── layout.html                # Shell: nav, sidebar, main content area, patron badge top-right
│   │   ├── auth.html                  # Auth page: username, scope checkboxes, mint button
│   │   ├── dashboard.html             # Main dashboard with split-pane request/response viewer
│   │   ├── catalog.html               # Catalog browser — list, search, filter
│   │   ├── item.html                  # Item detail — metadata + cover image
│   │   ├── account.html               # Patron account — overdue items, return button, card number
│   │   └── report.html                # Report generator — form, progress, chunk viewer
│   ├── public/
│   │   ├── app.css                    # Dashboard styles
│   │   └── app.js                     # Client-side JS: call API, render envelopes, polling
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
│
├── www/                               # === www.opencall-api.com ===
│   ├── index.html                     # Brochure landing page
│   ├── style.css
│   ├── assets/
│   │   └── xkcd-927.png              # XKCD Standards comic
│   └── firebase.json                  # Firebase Hosting config
│
├── agents/                            # === agents.opencall-api.com ===
│   ├── index.md                       # Root endpoint — plain markdown instructions for LLMs
│   └── firebase.json                  # Firebase Hosting config (serves .md as text/markdown)
│
├── docs/
│   └── prompt.md                      # This file
└── CLAUDE.md
```

Three deployable units. No monorepo tooling — each has its own `package.json` and `Dockerfile` (except `www/` which is static). Shared types can be copied or symlinked during the SDD phase if needed.

---

## Domain model: the lending library

### Catalog items

The library lends physical items. Each item in the catalog has:

```typescript
type CatalogItem = {
  id: string // e.g. "book-978-0-14-028329-7"
  type: "book" | "cd" | "dvd" | "boardgame"
  title: string // e.g. "The Great Gatsby"
  creator: string // author / artist / publisher
  year: number // publication year
  isbn?: string // ISBN for books
  description: string // 1-2 sentence blurb
  coverImageKey?: string // GCS object key for cover image
  tags: string[] // e.g. ["fiction", "classic", "american"]
  available: boolean // is a copy currently on the shelf
  totalCopies: number // how many copies the library owns
  availableCopies: number // how many are currently available
}
```

### Seed data

- **~200 items** seeded from Open Library API (books) + faker (CDs, DVDs, board games).
- Books: pull real metadata (title, author, year, ISBN, description) from Open Library. Use Open Library Covers API for cover images — download ~50 cover images to GCS during seed, the rest get a placeholder.
- CDs/DVDs/board games: generate with faker. Convincing titles, creators, years. No cover images (placeholder only).
- Availability: randomly assign `totalCopies` (1-5) and `availableCopies` (0 to totalCopies).

### Patrons

Each demo auth token is implicitly a "patron." When a token is minted, a patron record is created (or reused if the username already exists). The patron is the identity that has lending history, overdue items, and reservations.

```typescript
type Patron = {
  id: string // e.g. "patron-leaping-lizard"
  username: string // matches the auth token username
  name: string // display name (faker-generated at seed, or username for demo users)
  cardNumber: string // 10-digit library card number, e.g. "2810-4429-73"
  createdAt: string // ISO 8601 datetime
}
```

**Library card numbers** are assigned to every patron at creation time. The format is `XXXX-XXXX-XX` (10 digits, hyphenated for readability). Pre-seeded patrons get stable card numbers. When a new patron is created via `POST /auth`, a new card number is generated and returned in the response.

**Card numbers for agents:** AI agents authenticate using a library card number (via `POST /auth/agent`). The human patron shares their card number with the agent — this is displayed prominently in the app dashboard (top-right corner, alongside the patron's name). The agent then uses this card number to get a token scoped specifically for agent operations.

**Key design choice:** When a demo user mints a token with username "leaping-lizard", they become patron "patron-leaping-lizard". The seed data pre-creates ~50 patrons with lending history. If a demo user happens to pick a seeded username, they inherit that patron's history (overdue items and all). If they pick a new username, a fresh patron is created — but **every new patron is seeded with at least 2 overdue items** so the reservation-blocked scenario works initially. This is the "scripted" part of the demo — but the patron CAN return overdue items to unblock reservations.

### Lending history (synthetic, for reports)

Generated by faker at seed time. Stored in SQLite. ~5,000 rows across ~50 pre-seeded patrons:

```typescript
type LendingRecord = {
  id: string
  itemId: string
  patronId: string // e.g. "patron-leaping-lizard"
  patronName: string // faker full name or username
  checkoutDate: string // ISO 8601 date
  dueDate: string // 14 days after checkout
  returnDate: string | null // null if still out
  daysLate: number // 0 if returned on time or early
  reservedDate: string | null // date a hold was placed, if any
  collectionDelayDays: number | null // days between "ready for pickup" and actual collection
}
```

**Overdue item seeding:** Every patron (pre-seeded and newly created) has at least 2 items checked out past their due date with `returnDate = null` and `daysLate > 0`. This ensures the `v1:item.reserve` → `OVERDUE_ITEMS_EXIST` scenario fires initially. The overdue items are real catalog items so the agent can look them up. However, patrons can return items via `v1:item.return` to clear their overdue status and then successfully reserve.

### Reservations

```typescript
type Reservation = {
  id: string
  itemId: string
  patronId: string
  status: "pending" | "ready" | "collected" | "cancelled"
  reservedAt: string // ISO 8601 datetime
  readyAt: string | null // when the item became available for pickup
  collectedAt: string | null // when the patron collected it
  cancelledAt: string | null // if cancelled
}
```

Reservations are created by `v1:item.reserve`. In the demo, reservations will initially fail due to overdue items. The patron (or agent acting on their behalf) can return items via `v1:item.return` to clear their overdue status, then successfully reserve.

---

## Operations

### JSDoc convention

Each operation is annotated with a compact set of JSDoc tags. The registry is generated from these at boot time.

```ts
/**
 * Human-readable description of the operation.
 *
 * @op v1:namespace.operationName
 * @flags sync|async cacheable? idempotent? mutating?
 * @security scope1 scope2
 * @timeout 200ms|5s
 * @ttl 1h|30m|0
 * @cache none|server|location
 * @deprecated Use v1:other.op instead
 * @sunset 2026-06-01
 * @replacement v1:other.op
 */
```

**`@flags`** — space-separated tokens. First token is the execution model (`sync`, `async`, `stream`). Remaining tokens are boolean flags — present means true, absent means false:

- `cacheable` → maps to `sideEffecting: false` (inverse logic: cacheable means NOT side-effecting)
- `mutating` → maps to `sideEffecting: true`
- `idempotent` → maps to `idempotencyRequired: true`

**`@security`** — space-separated scope names. AND logic: caller must have ALL listed scopes. Maps to `authScopes` in the registry.

**`@timeout`** — human-readable duration. Maps to `maxSyncMs` in the registry (`200ms` → `200`, `5s` → `5000`).

**`@ttl`** — human-readable duration. Maps to `ttlSeconds` in the registry (`1h` → `3600`, `30m` → `1800`, `0` → `0`).

**`@cache`** — caching policy. Maps directly to `cachingPolicy` in the registry.

### JSDoc → Registry field mapping

| JSDoc tag             | Registry field        | Parsing                                                  |
| --------------------- | --------------------- | -------------------------------------------------------- |
| `@op`                 | `op`                  | Direct string                                            |
| `@flags` (1st)        | `executionModel`      | First token: `sync`, `async`, or `stream`                |
| `@flags` `cacheable`  | `sideEffecting`       | `false` (inverse: cacheable = not side-effecting)        |
| `@flags` `mutating`   | `sideEffecting`       | `true`                                                   |
| `@flags` `idempotent` | `idempotencyRequired` | `true`                                                   |
| `@security`           | `authScopes`          | Split on space → string array                            |
| `@timeout`            | `maxSyncMs`           | Parse duration: `200ms` → `200`, `5s` → `5000`           |
| `@ttl`                | `ttlSeconds`          | Parse duration: `1h` → `3600`, `30m` → `1800`, `0` → `0` |
| `@cache`              | `cachingPolicy`       | Direct string: `none`, `server`, or `location`           |
| `@deprecated`         | `deprecated`          | Tag presence → `true`                                    |
| `@sunset`             | `sunset`              | ISO date string                                          |
| `@replacement`        | `replacement`         | Op name string                                           |

If neither `cacheable` nor `mutating` appears in `@flags`, `sideEffecting` defaults to `false`. If `idempotent` is absent, `idempotencyRequired` defaults to `false`.

### Schema inference from Zod

Schemas are NOT in separate JSON files. Each operation module exports colocated Zod schemas (`args` and `result`):

```ts
import { z } from "zod"

export const args = z.object({
  type: z.enum(["book", "cd", "dvd", "boardgame"]).optional().describe("Filter by item type"),
  search: z.string().optional().describe("Free-text search across title and creator"),
  available: z.boolean().optional().describe("Filter to only available items"),
  limit: z.number().int().min(1).max(100).default(20).describe("Page size"),
  offset: z.number().int().min(0).default(0).describe("Pagination offset"),
})

export const result = z.object({
  items: z.array(CatalogItemSummary),
  total: z.number().int().describe("Total matching items"),
  limit: z.number().int(),
  offset: z.number().int(),
})

/**
 * Lists catalog items with optional filtering and pagination.
 *
 * @op v1:catalog.list
 * @flags sync cacheable
 * @security items:browse
 * @timeout 200ms
 * @ttl 1h
 * @cache server
 */
export async function v1CatalogList(input: z.infer<typeof args>, ctx: OpContext): Promise<z.infer<typeof result>> {
  return catalogListService(input, ctx)
}
```

At boot time, the registry builder:

1. Scans `src/operations/*.ts`
2. Imports each module → reads `args` and `result` exports
3. Calls `z.toJSONSchema()` (Zod v4 native) to convert to JSON Schema
4. Parses JSDoc from the exported `execute` function for metadata tags
5. Assembles the full registry object

This eliminates separate JSON Schema files entirely. The Zod schemas serve triple duty: runtime validation, TypeScript type inference (`z.infer<typeof args>`), and JSON Schema generation for the registry.

---

### `v1:catalog.list` — List catalog items

`@flags sync cacheable` · `@security items:browse` · `@timeout 200ms` · `@ttl 1h` · `@cache server`

**Args (Zod):**

```ts
export const args = z.object({
  type: z.enum(["book", "cd", "dvd", "boardgame"]).optional().describe("Filter by item type"),
  search: z.string().optional().describe("Free-text search across title and creator"),
  available: z.boolean().optional().describe("Filter to only available items"),
  limit: z.number().int().min(1).max(100).default(20).describe("Page size"),
  offset: z.number().int().min(0).default(0).describe("Pagination offset"),
})
```

**Result (Zod):**

```ts
export const result = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      type: z.enum(["book", "cd", "dvd", "boardgame"]),
      title: z.string(),
      creator: z.string(),
      year: z.number().int(),
      available: z.boolean(),
      availableCopies: z.number().int(),
      totalCopies: z.number().int(),
    }),
  ),
  total: z.number().int().describe("Total matching items (for pagination)"),
  limit: z.number().int(),
  offset: z.number().int(),
})
```

---

### `v1:catalog.listLegacy` — Deprecated alias

`@flags sync cacheable` · `@security items:browse` · `@timeout 200ms` · `@ttl 1h` · `@cache server` · `@deprecated Use v1:catalog.list instead` · `@sunset 2026-06-01` · `@replacement v1:catalog.list`

Same args and result schemas as `v1:catalog.list`. The controller delegates directly to `v1:catalog.list`'s service function. Exists solely to demonstrate the deprecation lifecycle.

```ts
/**
 * Lists catalog items (legacy endpoint).
 *
 * @op v1:catalog.listLegacy
 * @flags sync cacheable
 * @security items:browse
 * @timeout 200ms
 * @ttl 1h
 * @cache server
 * @deprecated Use v1:catalog.list instead
 * @sunset 2026-06-01
 * @replacement v1:catalog.list
 */
export async function v1CatalogListLegacy(input: z.infer<typeof args>, ctx: OpContext): Promise<z.infer<typeof result>> {
  return catalogListService(input, ctx)
}
```

---

### `v1:item.get` — Get item details

`@flags sync cacheable` · `@security items:read` · `@timeout 200ms` · `@ttl 1h` · `@cache server`

**Args (Zod):**

```ts
export const args = z.object({
  itemId: z.string().describe("Catalog item ID"),
})
```

**Result (Zod):** Full `CatalogItem` Zod schema (all fields from the domain model).

**Domain error:** If `itemId` does not exist, return `state=error` with HTTP 200 and error code `ITEM_NOT_FOUND`. This is a domain error, not a protocol error — per spec, business failures use `state=error` inside a 200, not a 404.

---

### `v1:item.getMedia` — Get cover image URL

`@flags sync cacheable` · `@security items:read` · `@timeout 200ms` · `@ttl 1h` · `@cache location`

**Args (Zod):**

```ts
export const args = z.object({
  itemId: z.string().describe("Catalog item ID"),
})
```

**Response behavior:**

- If the item has a `coverImageKey` in GCS → generate a **signed URL** (1 hour expiry) and return:
  - HTTP `303` with `Location` header pointing to the signed URL (per spec: pre-signed URL, no auth needed, safe auto-follow)
  - Also include `location.uri` in the response body for clients that read the body
- If the item has no cover image → return `state=complete` with `result: { placeholder: true, uri: "/assets/placeholder-cover.png" }` as a 200
- If the item doesn't exist → domain error `ITEM_NOT_FOUND` (200 with `state=error`)

This operation demonstrates the `303` redirect pattern and the `location` response field.

---

### `v1:item.return` — Return a checked-out item

`@flags sync mutating idempotent` · `@security items:write` · `@timeout 500ms` · `@ttl 0` · `@cache none`

**Args (Zod):**

```ts
export const args = z.object({
  itemId: z.string().describe("Catalog item ID to return"),
})
```

**Result (Zod):**

```ts
export const result = z.object({
  itemId: z.string(),
  title: z.string(),
  returnedAt: z.string().datetime(),
  wasOverdue: z.boolean(),
  daysLate: z.number().int(),
  message: z.string(),
})
```

**Behavior:** Marks the lending record as returned (`returnDate = now`, recalculates `daysLate`). Increments the item's `availableCopies`. If this was the patron's last overdue item, reservations become unblocked.

**Domain errors:**

| Error code             | When                                      | Message                                     |
| ---------------------- | ----------------------------------------- | ------------------------------------------- |
| `ITEM_NOT_FOUND`       | `itemId` doesn't exist                    | "No catalog item found with ID '{itemId}'." |
| `ITEM_NOT_CHECKED_OUT` | Patron doesn't have this item checked out | "You do not have '{title}' checked out."    |

**The demo narrative (updated):** This operation completes the interaction arc. Patrons start with overdue items, try to reserve, get blocked, check their overdue items, return them one by one, and can then successfully reserve. This demonstrates:

1. Domain errors with actionable messages that guide the caller
2. Cross-operation business rules (reserve depends on overdue status)
3. State mutation that affects subsequent operations
4. How an agent navigates a multi-step workflow with failures and recovery

---

### `v1:item.reserve` — Reserve a catalog item for pickup

`@flags sync mutating idempotent` · `@security items:write` · `@timeout 500ms` · `@ttl 0` · `@cache none`

**Args (Zod):**

```ts
export const args = z.object({
  itemId: z.string().describe("Catalog item ID to reserve"),
})
```

**Result (Zod):**

```ts
export const result = z.object({
  reservationId: z.string(),
  itemId: z.string(),
  title: z.string(),
  status: z.literal("pending"),
  reservedAt: z.string().datetime(),
  message: z.string(),
})
```

**Domain errors (HTTP 200 with `state=error`):**

| Error code            | When                                                   | Message                                                                                                                                    |
| --------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `OVERDUE_ITEMS_EXIST` | Patron has overdue items                               | "Reservations are not permitted while you have outstanding overdue items. You have {n} overdue item(s). Use v1:patron.get to see details." |
| `ITEM_NOT_FOUND`      | `itemId` doesn't exist                                 | "No catalog item found with ID '{itemId}'."                                                                                                |
| `ITEM_NOT_AVAILABLE`  | Item exists but `availableCopies` = 0                  | "'{title}' has no copies currently available for reservation."                                                                             |
| `ALREADY_RESERVED`    | Patron already has an active reservation for this item | "You already have an active reservation for '{title}'."                                                                                    |

**The demo narrative:** This operation is initially designed to fail. Every patron starts with overdue items, so the first `v1:item.reserve` call returns `OVERDUE_ITEMS_EXIST`. The error message explicitly tells the caller to check `v1:patron.get` — this guides both human users and AI agents into the next step of the interaction. Unlike previous iterations, the patron CAN now return overdue items via `v1:item.return`, then successfully reserve.

An agent encountering this will naturally:

1. Try `v1:item.reserve` → get `OVERDUE_ITEMS_EXIST`
2. Call `v1:patron.get` → see the overdue items
3. Return the overdue items one by one via `v1:item.return`
4. Retry `v1:item.reserve` → success

---

### `v1:patron.get` — Get current patron details including overdue items

`@flags sync cacheable` · `@security patron:read` · `@timeout 200ms` · `@ttl 0` · `@cache none`

**Args (Zod):**

```ts
export const args = z.object({})
```

No args — the patron is derived from the auth token. The token's username maps to a patron ID.

**Result (Zod):**

```ts
export const result = z.object({
  patronId: z.string(),
  patronName: z.string(),
  cardNumber: z.string().describe("Library card number (XXXX-XXXX-XX format)"),
  overdueItems: z.array(
    z.object({
      itemId: z.string(),
      title: z.string(),
      type: z.enum(["book", "cd", "dvd", "boardgame"]),
      checkoutDate: z.string().date(),
      dueDate: z.string().date(),
      daysOverdue: z.number().int(),
    }),
  ),
  totalOverdue: z.number().int(),
  activeReservations: z.number().int().describe("Number of active reservations"),
  totalCheckedOut: z.number().int().describe("Total items currently checked out"),
})
```

**Behavior:** Always returns at least 2 overdue items for any new patron (see seed data design). This is intentional — it sets up the `v1:item.reserve` rejection scenario initially. The patron can clear overdue items by returning them via `v1:item.return`.

---

### `v1:patron.history` — Get lending history for the current patron

`@flags sync cacheable` · `@security patron:read` · `@timeout 200ms` · `@ttl 5m` · `@cache server`

**Args (Zod):**

```ts
export const args = z.object({
  limit: z.number().int().min(1).max(100).default(20).describe("Page size"),
  offset: z.number().int().min(0).default(0).describe("Pagination offset"),
  status: z.enum(["active", "returned", "overdue"]).optional().describe("Filter by lending status"),
})
```

**Result (Zod):**

```ts
export const result = z.object({
  patronId: z.string(),
  records: z.array(
    z.object({
      id: z.string(),
      itemId: z.string(),
      title: z.string(),
      type: z.enum(["book", "cd", "dvd", "boardgame"]),
      checkoutDate: z.string().date(),
      dueDate: z.string().date(),
      returnDate: z.string().date().nullable(),
      daysLate: z.number().int(),
      status: z.enum(["active", "returned", "overdue"]),
    }),
  ),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
})
```

---

### `v1:patron.fines` — Get outstanding fines for the current patron

`@flags sync cacheable` · `@security patron:billing` · `@timeout 200ms` · `@ttl 0` · `@cache none`

**This operation exists to demonstrate `403 Insufficient Scopes`.** The `patron:billing` scope is never granted to demo users or agents. Any call to this operation will return a `403` with a clear error envelope explaining which scope is missing.

**Args (Zod):**

```ts
export const args = z.object({})
```

**Result (Zod):** (never reached in demo)

```ts
export const result = z.object({
  patronId: z.string(),
  fines: z.array(
    z.object({
      itemId: z.string(),
      title: z.string(),
      amount: z.number().describe("Fine amount in dollars"),
      reason: z.string(),
      issuedAt: z.string().datetime(),
    }),
  ),
  totalOwed: z.number().describe("Total outstanding fines in dollars"),
})
```

---

### `v1:catalog.bulkImport` — Bulk import catalog items

`@flags async mutating` · `@security items:manage` · `@timeout 5s` · `@ttl 1h` · `@cache none`

**This operation exists to demonstrate `403 Insufficient Scopes`.** The `items:manage` scope is never granted to demo users or agents. Any call to this operation will return a `403` with a clear error envelope explaining which scope is missing. It also appears in the registry as an async, mutating operation — giving visitors a sense of the full range of operation types.

**Args (Zod):**

```ts
export const args = z.object({
  source: z.enum(["openlibrary", "csv"]).describe("Import source"),
  query: z.string().optional().describe("Search query for Open Library import"),
  limit: z.number().int().min(1).max(500).default(50).describe("Maximum items to import"),
})
```

**Result (Zod):** (never reached in demo)

```ts
export const result = z.object({
  imported: z.number().int(),
  skipped: z.number().int(),
  errors: z.array(
    z.object({
      index: z.number().int(),
      reason: z.string(),
    }),
  ),
})
```

---

### `v1:report.generate` — Generate lending history report

`@flags async mutating idempotent` · `@security reports:generate` · `@timeout 5s` · `@ttl 1h` · `@cache none`

**Args (Zod):**

```ts
export const args = z.object({
  format: z.enum(["csv", "json"]).default("csv").describe("Output format"),
  itemType: z.enum(["book", "cd", "dvd", "boardgame"]).optional().describe("Filter by item type"),
  dateFrom: z.string().date().optional().describe("Start date for report range"),
  dateTo: z.string().date().optional().describe("End date for report range"),
})
```

**Result:** Not inline. The report is stored in GCS. On completion, the polling endpoint returns `state=complete` with a `location.uri` pointing to the GCS object and uses the chunking spec to deliver in pages of 100.

**Async lifecycle:**

1. `POST /call` → `202` with `state=accepted`, `location.uri` = `/ops/{requestId}`, `retryAfterMs` = 1000, `expiresAt` = now + 3600
2. Caller polls `GET /ops/{requestId}`:
   - `state=pending` while generating (simulate 3-5 seconds of work)
   - `state=complete` when done, with `location.uri` pointing to the generated report in GCS (signed URL)
   - `state=error` if generation fails
3. Report is also available via chunks at `GET /ops/{requestId}/chunks?cursor=...`

**Chunking:**

- The generated report (CSV or JSON) is ~100-500 KB of synthetic lending history.
- Chunks are 64 KB each, sliced from the stored report.
- Each chunk includes `checksum` (SHA-256 of chunk data), `checksumPrevious` (SHA-256 of previous chunk data, `null` for first), `offset`, `length`, `mimeType`, `total`, `cursor`, and `data`.
- For CSV: `data` is raw text. For JSON: `data` is raw text. (Both are text-based, no base64.)
- `state=pending` while more chunks remain; `state=complete` on the final chunk.

**XState machine for this operation:**

```
┌──────────┐     START      ┌──────────┐    PROGRESS    ┌──────────┐
│ accepted │ ─────────────→ │ pending  │ ─────────────→ │ complete │
└──────────┘                └──────────┘                └──────────┘
      │                          │
      │         FAIL             │         FAIL
      └────────────────→─────────┴──────────────→ ┌──────────┐
                                                  │  error   │
                                                  └──────────┘
```

Events: `START` (begin execution), `PROGRESS` (work underway — optional, for logging), `COMPLETE` (result stored), `FAIL` (error occurred).

Context stored per instance: `requestId`, `sessionId`, `op`, `args`, `createdAt`, `expiresAt`, `resultLocation` (GCS key, set on completion), `error` (set on failure).

---

## Auth system

There are two auth contexts: the **API** (bearer token, per spec) and the **App** (session cookie, wrapping the API token). There are also two kinds of API tokens: **human** (full scope selection) and **agent** (fixed scope set, requires library card number).

### API auth (`api.opencall-api.com`)

The API is the OpenCALL-compliant surface. It uses `Authorization: Bearer <token>` per the HTTP binding spec. No cookies, no sessions, no HTML — pure API.

#### `POST /auth` — Mint a demo token (human users)

Request:

```json
{
  "username": "leaping-lizard",
  "scopes": ["items:browse", "items:read", "items:write", "patron:read", "reports:generate"]
}
```

- `username` — optional. If omitted, the server generates one (adjective-animal format: "leaping-lizard", "purple-piranha", "turquoise-toucan").
- `scopes` — optional. If omitted, defaults to the full default set (see Scopes table below). POST endpoint should strip the intentionally missing scopes, and/or detect them and issue a 403 response.

Response:

```json
{
  "token": "demo_a1b2c3d4e5f6...",
  "username": "leaping-lizard",
  "cardNumber": "2810-4429-73",
  "scopes": ["items:browse", "items:read", "items:write", "patron:read", "reports:generate"],
  "expiresAt": 1739368800
}
```

#### `POST /auth/agent` — Mint an agent token (AI agents)

Request:

```json
{
  "cardNumber": "2810-4429-73"
}
```

- `cardNumber` — **required**. Must match an existing patron's library card number. The agent acts as that patron.

Response:

```json
{
  "token": "agent_x9y8z7w6v5u4...",
  "username": "leaping-lizard",
  "patronId": "patron-leaping-lizard",
  "cardNumber": "2810-4429-73",
  "scopes": ["items:browse", "items:read", "items:write", "patron:read"],
  "expiresAt": 1739368800
}
```

Agent tokens are always prefixed with `agent_` (vs `demo_` for human tokens). Agent tokens receive a fixed scope set: `items:browse`, `items:read`, `items:write`, `patron:read`. Agents cannot generate reports or access billing — they can browse the catalog, view item details, return items, and reserve items.

**Errors:**

| Error              | When                                   | HTTP |
| ------------------ | -------------------------------------- | ---- |
| `INVALID_CARD`     | `cardNumber` is missing or malformed   | 400  |
| `PATRON_NOT_FOUND` | No patron exists with that card number | 404  |

**Side-effect: patron creation (on `POST /auth` only).** When a human user token is minted, the server checks if a patron with that username exists. If not, it creates one (with a new library card number) and seeds it with 2-3 overdue lending records (randomly selected catalog items, checkout dates 30-60 days ago, due dates in the past). This ensures the `v1:item.reserve` → `OVERDUE_ITEMS_EXIST` scenario works for every patron initially.

**Token format:** Opaque string prefixed with `demo_` or `agent_` followed by 32 random hex characters. No JWT. Tokens stored in SQLite with username, scopes, and expiry (24 hours).

**Token validation on `/call`:** Auth middleware extracts the bearer token from the `Authorization` header, looks it up in SQLite, checks expiry, and attaches the resolved scopes to the request context. The dispatcher checks the required scopes (from the registry) against the granted scopes before dispatching to the controller.

- Missing/invalid/expired token → `401` with canonical error envelope
- Valid token, insufficient scopes → `403` with canonical error envelope listing the missing scopes
- Per spec: HTTP binding uses `Authorization` header, not envelope `auth` block

### App auth (`app.opencall-api.com`)

The app is the human-facing frontend. It wraps the API token in a server-side session so the browser doesn't need to manage bearer tokens directly.

**Flow:**

1. User visits `app.opencall-api.com/` (any page).
2. App server checks for a `sid` cookie → looks up session in SQLite.
3. **No valid session?** → redirect to `app.opencall-api.com/auth`.
4. **Auth page** shows:
   - A generated username (or the one from their existing session if they're changing scopes)
   - Checkboxes for scopes (all default scopes checked — see Scopes table)
   - If they already have a session, their current scopes are shown as checked, and they can add/remove
   - A "Start Demo" button (or "Update Scopes" if already authed)
5. User clicks the button → app `POST /auth` handler:
   - POSTs to `api.opencall-api.com/auth` with `{ username, scopes }`
   - Receives `{ token, username, cardNumber, scopes, expiresAt }`
   - Creates a server-side session in SQLite: `{ sid, token, username, cardNumber, scopes, expiresAt }`
   - Sets `sid` cookie (HttpOnly, Secure, SameSite=Lax, path=/)
   - Redirects to `app.opencall-api.com/` (dashboard)
6. **All subsequent requests:** App reads `sid` cookie → resolves session → uses the stored `token` in `Authorization: Bearer` header when calling the API.

**Session store:** SQLite table `sessions` with columns `sid`, `token`, `username`, `card_number`, `scopes` (JSON), `expires_at`, `created_at`. Sessions expire when the underlying API token expires (24 hours).

**Logout:** `GET /logout` clears the session from SQLite and removes the `sid` cookie, then redirects to `/auth`.

### Scopes

| Scope              | Grants access to                           | Default (human) | Agent |
| ------------------ | ------------------------------------------ | --------------- | ----- |
| `items:browse`     | `v1:catalog.list`, `v1:catalog.listLegacy` | Yes             | Yes   |
| `items:read`       | `v1:item.get`, `v1:item.getMedia`          | Yes             | Yes   |
| `items:write`      | `v1:item.reserve`, `v1:item.return`        | Yes             | Yes   |
| `items:manage`     | `v1:catalog.bulkImport`                    | **No**          | No    |
| `patron:read`      | `v1:patron.get`, `v1:patron.history`       | Yes             | Yes   |
| `patron:billing`   | `v1:patron.fines`                          | **No**          | No    |
| `reports:generate` | `v1:report.generate`                       | Yes             | No    |

**Human default set:** `items:browse`, `items:read`, `items:write`, `patron:read`, `reports:generate`. The user can uncheck any to test what happens when scopes are insufficient.

**Agent fixed set:** `items:browse`, `items:read`, `items:write`, `patron:read`. Agents cannot generate reports (they'd need `reports:generate`) and nobody can access billing or bulk import.

**Scopes that always 403:** `items:manage` and `patron:billing` are never granted to any user or agent in the demo. Operations requiring these scopes exist in the registry (visible in `/.well-known/ops`) but always return `403` when called. This is intentional — it demonstrates scope enforcement and gives visitors operations to "try and fail" with.

### Scope changes

A user can visit `/auth` at any time to change their scopes. This mints a new API token with the new scope set, replaces the session's token, and redirects back to the dashboard. The old token is not revoked — it just expires naturally. This keeps the demo simple.

---

## Database reset

The demo database is periodically reset to its seed state to keep the demo experience consistent for all visitors.

**Reset behavior:**

- All patron-created data is wiped: tokens, sessions, patron records created after seed, lending records modified after seed, reservations
- The original ~50 seed patrons, ~200 catalog items, and ~5,000 lending records are restored to their initial state
- Cover images and generated reports in GCS are not affected (reports are ephemeral anyway)

**Reset schedule:** Every 4 hours via a Cloud Scheduler → Cloud Run job, or on manual trigger via an admin endpoint (`POST /admin/reset` with a shared secret in the `Authorization` header).

**User experience:** If a user is mid-session when a reset occurs, their next API call will fail with `401` (token expired/invalid). The app will redirect them to `/auth` to start a new session. The auth page can show a banner: "The demo has been reset. Please start a new session."

---

## Analytics (non-resetting)

The API server tracks usage metrics in a **separate set of tables that are NOT wiped during database reset**. No Google Analytics, no third-party scripts, no frontend tracking. All data is captured server-side from the auth middleware and request pipeline.

### What we track

**Visitors** — one row per unique human session:

```typescript
type AnalyticsVisitor = {
  id: string // UUID
  patronId: string | null // linked after auth, e.g. "patron-leaping-lizard"
  cardNumber: string | null // library card number, if authed
  username: string | null // patron username, if authed
  userAgent: string // raw User-Agent header
  ip: string // client IP (X-Forwarded-For on Cloud Run, or remote address)
  referrer: string | null // Referer header on first auth request
  pageViews: number // incremented on each proxied page request (app server)
  apiCalls: number // incremented on each POST /call
  createdAt: string // ISO 8601 — first auth
  updatedAt: string // ISO 8601 — last activity (updated on every request)
}
```

**Agents** — one row per agent token:

```typescript
type AnalyticsAgent = {
  id: string // UUID
  visitorId: string // FK → analytics_visitors.id (linked via card number at agent auth time)
  patronId: string // the patron this agent acts as
  cardNumber: string // the card number used to authenticate
  userAgent: string // raw User-Agent header from the agent's auth request
  ip: string // client IP
  apiCalls: number // incremented on each POST /call made with this agent token
  createdAt: string // ISO 8601 — agent token minted
  updatedAt: string // ISO 8601 — last agent API call
}
```

### How data is captured

**On `POST /auth` (human):**

1. Auth handler mints the token as normal
2. After success, upsert into `analytics_visitors`: match on IP + User-Agent combination (returning visitors get their existing row updated). Set `patronId`, `cardNumber`, `username`, `referrer` (from `Referer` header), `userAgent`, `ip`. Set `createdAt` if new, always update `updatedAt`.
3. Store the `analytics_visitors.id` in the session alongside the token — the app server uses this to increment counters without additional lookups.

**On `POST /auth/agent`:**

1. Agent auth handler mints the token as normal
2. Look up the `analytics_visitors` row by `cardNumber` (the patron who shared their card with the agent). If no visitor row exists for that card number, create one with minimal data.
3. Insert into `analytics_agents`: link to `visitorId`, record `patronId`, `cardNumber`, `userAgent`, `ip`.
4. Store the `analytics_agents.id` in the token metadata (in SQLite `auth_tokens` table) so it can be looked up on each API call.

**On each proxied page request (app server):**

1. App server resolves the session → gets the `analytics_visitors.id`
2. Increment `pageViews` and update `updatedAt` on the visitor row
3. This is a fire-and-forget UPDATE — no waiting for the DB write to complete before responding

**On each `POST /call`:**

1. Auth middleware resolves the token → gets the token type (`demo` or `agent`)
2. For `demo` tokens: increment `apiCalls` on the visitor's `analytics_visitors` row
3. For `agent` tokens: increment `apiCalls` on the agent's `analytics_agents` row
4. Both are fire-and-forget UPDATEs piggybacking on the auth middleware — no separate middleware, no performance impact

### Returning visitors

The IP + User-Agent combination is used to detect returning visitors. If someone comes back on a different day with the same browser, their `updatedAt` will be updated and their `pageViews`/`apiCalls` counters continue incrementing. If they re-auth (because of a reset or expired session), the existing row is reused — not duplicated.

This is imperfect (shared IPs, browser updates) but good enough for a demo's usage metrics. The `createdAt` vs `updatedAt` gap shows how many visitors return on subsequent days.

### Non-resetting guarantee

The analytics tables (`analytics_visitors`, `analytics_agents`) are **excluded from the database reset script**. They accumulate across resets indefinitely. The reset script only touches: `auth_tokens`, `sessions`, `patrons` (non-seed), `lending_history` (modifications), `reservations`, `operations`.

### No frontend tracking

There is no JavaScript analytics, no tracking pixels, no cookies for analytics purposes. The `sid` cookie is purely for session management. All metrics are derived from server-side request data that the server already has (auth headers, User-Agent, IP, Referer). The analytics tables are never exposed to clients — there is no endpoint to query them. They exist purely for the demo operator to inspect via direct SQLite queries or a future admin dashboard.

---

## Spec compliance checklist

These behaviors are required by the OpenCALL spec and MUST be implemented:

### Envelope

- [ ] `POST /call` accepts `application/json` body with `{ op, args, ctx?, media? }`
- [ ] `ctx` is optional; if omitted, server generates `requestId` (UUID)
- [ ] `ctx.requestId` required when `ctx` is present
- [ ] `sessionId` echoed in response when present in request
- [ ] Response is always the canonical envelope: `{ requestId, sessionId?, state, result?, error?, location?, retryAfterMs?, expiresAt? }`
- [ ] `result`, `location`, `error` are mutually exclusive per `state`

### Status codes

- [ ] `200` only for `state=complete` synchronous responses
- [ ] `202` for `state=accepted`/`pending` (async operations)
- [ ] `303` only for redirect to pre-signed/public URL (no body processing required)
- [ ] `400` for malformed envelope, unknown operation, schema validation failure — with canonical error envelope and server-generated `requestId` if none parseable
- [ ] `401` for missing/invalid auth
- [ ] `403` for valid auth, insufficient scopes — with missing scope names in error `cause`
- [ ] `404` for expired/unknown `requestId` on `/ops/{requestId}` or `/ops/{requestId}/chunks`
- [ ] `405` for `GET /call` — with `Allow: POST` header and JSON error body
- [ ] `410` for deprecated operations past sunset date — with `OP_REMOVED` error code and `replacement` in `cause`
- [ ] `429` if polling too frequently — with `retryAfterMs`
- [ ] `500` with full error payload for internal failures
- [ ] **Zero-information responses are forbidden.** Every error response includes a meaningful message.

### Domain vs protocol errors

- [ ] Business/domain errors (e.g. `ITEM_NOT_FOUND`, `OVERDUE_ITEMS_EXIST`) → HTTP 200 with `state=error`
- [ ] Protocol errors (malformed request, unknown op, bad auth) → HTTP 4xx with `state=error`
- [ ] Callers never need to inspect HTTP status codes to distinguish business outcomes

### Registry

- [ ] `GET /.well-known/ops` returns `{ callVersion: "2026-02-10", operations: [...] }`
- [ ] Each operation entry includes all required registry fields per spec
- [ ] `Cache-Control` and `ETag` headers on registry responses
- [ ] Registry is generated from JSDoc annotations + Zod schemas at boot time
- [ ] Operations requiring `items:manage` and `patron:billing` appear in registry (showing they exist) but always 403

### Async lifecycle

- [ ] Operation instances tracked in SQLite keyed by `requestId`
- [ ] State machine: `accepted → pending → complete | error` (forward-only)
- [ ] `expiresAt` set on all async responses
- [ ] `retryAfterMs` set on `accepted`/`pending` responses
- [ ] `location.uri` points to `/ops/{requestId}` for polling

### Chunks

- [ ] `GET /ops/{requestId}/chunks?cursor=...` returns chunk response per spec
- [ ] `chunk.checksum` = `sha256:{hex}` of chunk data
- [ ] `chunk.checksumPrevious` = checksum of previous chunk, `null` for first
- [ ] `mimeType`, `total`, `offset`, `length`, `cursor` included
- [ ] `state=pending` while more chunks, `state=complete` on final chunk
- [ ] Text content in `data` as raw string (not base64)

### Deprecation

- [ ] `v1:catalog.listLegacy` marked deprecated in registry with `sunset` and `replacement`
- [ ] Still callable until sunset date
- [ ] After sunset date → `410` with `OP_REMOVED` and replacement in error `cause`

---

## Storage

### SQLite schemas

**API database (`api/library.db`):**

- **catalog_items** — the lending library catalog
- **patrons** — patron records (linked to auth tokens by username), includes `card_number`
- **lending_history** — synthetic lending records (for reports + overdue checks)
- **reservations** — item reservations (created by `v1:item.reserve`)
- **operations** — operation instance state (requestId, state, result location, error, timestamps)
- **auth_tokens** — demo tokens (token, username, scopes JSON, token_type [demo|agent], analytics_id, expires_at)
- **analytics_visitors** — visitor tracking, non-resetting (id, patron_id, card_number, username, user_agent, ip, referrer, page_views, api_calls, created_at, updated_at)
- **analytics_agents** — agent tracking, non-resetting (id, visitor_id FK, patron_id, card_number, user_agent, ip, api_calls, created_at, updated_at)

**App database (`app/sessions.db`):**

- **sessions** — server-side sessions (sid, token, username, card_number, analytics_visitor_id, scopes JSON, expires_at, created_at)

### Google Cloud Storage

**Bucket:** `opencall-demo-library`

Prefixes:

- `covers/` — catalog item cover images (~50 files, seeded from Open Library)
- `reports/` — generated lending history reports (created by `v1:report.generate`)
- `assets/` — static assets (placeholder cover image)

---

## Brochure site: `www.opencall-api.com`

A static single-page site hosted on Firebase Hosting. This is the marketing/explainer surface.

### Hero section

- XKCD 927 (Standards) comic in the hero slot — links to https://xkcd.com/927/. ATTRIBUTE CREATOR!!
- Tagline: "Yes, we know. But hear us out."
- One-sentence description: "OpenCALL is an API specification that serves humans and AI agents through one endpoint, one envelope, one contract."
- **CTA button: "Try the Demo" → `app.opencall-api.com`**

### Sections (scrollable)

1. **The problem** — condensed from README.md "The Problem" section
2. **The answer** — `POST /call` example, condensed from README.md
3. **Try it** — CTA to the demo app + curl examples against `api.opencall-api.com`
4. **Compare** — summary table from comparisons.md (JSON-RPC, GraphQL, gRPC, SOAP, MCP, A2A) with link to full comparisons doc on GitHub
5. **Read the spec** — link to specification.md on GitHub
6. **Read the client guide** — link to client.md on GitHub ("Your REST SDK is apology code")

### Footer

- GitHub repo link
- "Built by one person. Will only get better with input from others."
- Link to blog post origin

### Design

- Clean, minimal. Dark mode (store as cookie for persistence). Monospace code blocks.
- No framework — plain HTML + CSS. Maybe a tiny bit of JS for smooth scroll.
- NO PURPLE GRADIENTS! Use solid colours with good contrast.

---

## Demo app: `app.opencall-api.com`

The app is the interactive frontend that **demonstrates the OpenCALL protocol in action**. It's not just a UI over the library catalog — it's a teaching tool that shows exactly what's happening on the wire.

### Core UX concept: split-pane envelope viewer

Every page that makes API calls shows a **split pane**:

- **Left/top:** The human-friendly UI (catalog list, item details, report progress, etc.)
- **Right/bottom:** The raw OpenCALL envelopes — the exact JSON `POST /call` request and the response — syntax-highlighted, updating in real time.

This is the demo's killer feature. A visitor browses the catalog and simultaneously sees:

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
│                             │    ...                      │
└─────────────────────────────┴─────────────────────────────┘
```

For async operations (report generation), the viewer shows the progression:

1. Initial `202 Accepted` response with `state=accepted`
2. Polling requests/responses as `state=pending`
3. Final `state=complete` with `location`
4. Chunk retrieval requests/responses (if viewing chunks)

### Patron badge (top-left)

Every page (once authenticated) shows a **patron badge** in the top-left corner of the layout:

```
┌──────────────────────┐
│  📇 2810-4429-73     │
│  leaping-lizard      │
└──────────────────────┘
```

The library card number is displayed prominently (larger font, monospace) with the username as subtext below it. This serves a dual purpose:

1. Reminds the user of their identity in the demo
2. Provides the card number they can share with an AI agent when the agent asks for it

Clicking the badge navigates to `/account`.

### Pages

**`/auth`** — Auth page

- Generated username (adjective-animal)
- Scope checkboxes (all default scopes checked)
- "Start Demo" / "Update Scopes" button
- If already authed, shows current username, card number, and scopes with option to change

**`/` (dashboard)** — Landing after auth

- Welcome message: "Logged in as `leaping-lizard`" with scopes listed
- Quick links to each demo feature
- "Change Scopes" link back to `/auth`
- Summary: what operations are available (pulled from registry)
- **Overdue warning banner** — if patron has overdue items, show a banner: "You have {n} overdue items" with a link to `/account`
- **Agent instructions callout** — brief note: "Want to try with an AI agent? Share your library card number (`2810-4429-73`) and point the agent to `agents.opencall-api.com`"

**`/catalog`** — Catalog browser

- Search box, type filter dropdown, availability toggle
- Paginated item list
- Each interaction fires `v1:catalog.list` → shows envelope in viewer
- Click an item → navigates to item detail

**`/catalog/:id`** — Item detail

- Full item metadata
- Cover image (loaded via `v1:item.getMedia` → shows the `303` redirect or placeholder in the viewer)
- Fires `v1:item.get` on load → shows envelope
- **"Reserve this item" button** → fires `v1:item.reserve`
  - On `OVERDUE_ITEMS_EXIST` error: shows a friendly message "You have overdue items — reservations are blocked" with link to `/account`, PLUS the raw error envelope in the viewer
  - On success: shows reservation confirmation
  - The envelope viewer shows the domain error clearly — this is the teaching moment

**`/catalog/:id` with bad ID** — Demonstrates domain error

- Shows the `ITEM_NOT_FOUND` domain error (HTTP 200, `state=error`) in the envelope viewer
- The UI shows a friendly "Item not found" message, but the envelope viewer shows the raw error

**`/account`** — Patron account

- Patron card number (prominently displayed, copyable)
- Patron name
- Fires `v1:patron.get` on load → shows envelope
- Lists all overdue items with checkout date, due date, days overdue
- **"Return" button** next to each overdue item → fires `v1:item.return`
  - Shows the return confirmation in the envelope viewer
  - Updates the overdue list in real-time
  - When all overdue items are returned, shows a success message: "All items returned! You can now reserve items."
- Lending history section: fires `v1:patron.history` → paginated list with status filter
- Message: "Share your library card number with an AI agent to let it browse and reserve on your behalf."

**`/reports`** — Report generator

- Form: format (CSV/JSON), item type filter, date range
- "Generate Report" button fires `v1:report.generate`
- Envelope viewer shows the full async lifecycle:
  1. `202` → `state=accepted` with `location`
  2. Polling → `state=pending` (auto-polls with progress indicator)
  3. `state=complete` with `location.uri` to the generated report
- "Download Report" link (to the signed GCS URL)
- "View Chunks" button → shows chunk retrieval with checksums in the viewer

**Scope errors** — Demonstrates `403`

- If a user unchecked a scope and tries to use a feature that requires it, the app shows the `403` error envelope inline in the viewer alongside a friendly message
- No dedicated `/forbidden` page — this happens naturally anywhere a scope is missing
- The `v1:patron.fines` and `v1:catalog.bulkImport` operations are shown in the registry but always 403

### Envelope viewer behavior

- **Collapsible/expandable** — can be collapsed to focus on the UI, or expanded to fill more space
- **Request tab / Response tab** — or stacked vertically
- **Timing** — shows response time in ms
- **HTTP status** — shown prominently (200, 202, 303, 400, 403, etc.)
- **Auto-scroll** — for async operations, new polling responses append below
- **Syntax highlighting** — JSON keys, strings, numbers in different colors
- **Copy button** — copy the full request or response as curl command or JSON

### Client-side implementation

The app's client-side JS (`app.js`) does NOT call the API directly from the browser. Instead:

1. Browser calls `app.opencall-api.com/api/call` (same-origin proxy endpoint on the app server)
2. App server reads the `sid` cookie → resolves session → gets the API token
3. App server forwards the request to `api.opencall-api.com/call` with `Authorization: Bearer <token>`
4. App server returns the response to the browser, including timing metadata
5. Browser renders the UI result AND the raw request/response envelopes

This keeps the API token out of the browser entirely. The browser only has the `sid` session cookie.

For the envelope viewer, the app server returns both the proxied response AND the request it sent:

```json
{
  "request": {
    "method": "POST",
    "url": "https://api.opencall-api.com/call",
    "headers": { "Authorization": "Bearer demo_***", "Content-Type": "application/json" },
    "body": { "op": "v1:catalog.list", "args": { "type": "book" }, "ctx": { "requestId": "..." } }
  },
  "response": {
    "status": 200,
    "headers": { "Content-Type": "application/json" },
    "body": { "requestId": "...", "state": "complete", "result": { ... } },
    "timeMs": 142
  }
}
```

The bearer token value is masked in the viewer (`demo_***`) so it's visible as a concept but not copyable as a credential.

---

## Agent discovery: `agents.opencall-api.com`

A single static markdown document served at the root. This is NOT an MCP server, not JSON, not a structured API — just plain text instructions that an LLM can read and follow.

### How agents find it

The `app.opencall-api.com` HTML includes standard discovery hints:

1. **`<meta>` tag in HTML `<head>`:**

   ```html
   <meta name="ai-instructions" content="https://agents.opencall-api.com/" />
   ```

2. **`X-AI-Instructions` response header** on all `app.opencall-api.com` responses:

   ```
   X-AI-Instructions: https://agents.opencall-api.com/
   ```

3. **`/.well-known/ai-instructions`** on `app.opencall-api.com` — redirects to `agents.opencall-api.com/`

4. **`robots.txt`** on `app.opencall-api.com`:
   ```
   # AI agents: see https://agents.opencall-api.com/ for API instructions
   User-agent: *
   Allow: /
   ```

Any of these paths gets the agent to the instructions page. The exact standard for AI agent discovery is still emerging — we include multiple approaches to maximize compatibility.

### Content of `agents.opencall-api.com/` (the markdown document)

```markdown
# OpenCALL Demo Library — Instructions for AI Agents

You are interacting with a demo lending library powered by the OpenCALL API specification.
This system lets you browse a catalog of books, CDs, DVDs, and board games, check patron
account status, return overdue items, and reserve items for pickup — all through a single
API endpoint.

## Authentication — You Need a Library Card Number

Before you can do anything, you need the patron's **library card number**. This is a
10-digit number in the format `XXXX-XXXX-XX` (e.g. `2810-4429-73`).

**Ask the user for their library card number.** They can find it in the top-right corner
of the app dashboard at `app.opencall-api.com`.

Once you have the card number, get a token:

POST https://api.opencall-api.com/auth/agent
Content-Type: application/json

{
"cardNumber": "2810-4429-73"
}

The response will include a `token` field. Use it in all subsequent requests:

Authorization: Bearer <token>

You will receive a fixed set of scopes: `items:browse`, `items:read`, `items:write`,
and `patron:read`. These let you browse the catalog, view item details, return items,
and reserve items.

## Calling operations

All operations go through a single endpoint:

POST https://api.opencall-api.com/call
Content-Type: application/json
Authorization: Bearer <your-token>

{
"op": "v1:catalog.list",
"args": { "type": "book", "limit": 10 }
}

The response is a JSON envelope with a `state` field:

- `state: "complete"` — the result is in the `result` field
- `state: "accepted"` or `"pending"` — poll the URL in `location.uri`
- `state: "error"` — the error is in the `error` field (this is a domain error, not a failure)

## Discovering available operations

GET https://api.opencall-api.com/.well-known/ops

This returns the full operation registry with schemas, execution models, and constraints.
Read this to understand what operations are available and what arguments they accept.

## Available operations (your scopes)

With your agent scopes, you can use:

- `v1:catalog.list` — Browse the catalog. Filter by type, search, availability.
- `v1:item.get` — Get full details for a catalog item by ID.
- `v1:item.getMedia` — Get a cover image URL for a catalog item.
- `v1:item.return` — Return a checked-out item. Clears overdue status.
- `v1:item.reserve` — Reserve a catalog item for pickup. Will fail if the patron
  has overdue items — return them first.
- `v1:patron.get` — Check the patron's account: overdue items, card number, checked-out
  items. No arguments needed — identity comes from your token.
- `v1:patron.history` — Get the patron's lending history with pagination and filters.

You will NOT have access to:

- `v1:report.generate` (requires `reports:generate`)
- `v1:patron.fines` (requires `patron:billing`)
- `v1:catalog.bulkImport` (requires `items:manage`)

## Common workflow

1. Ask the user for their library card number
2. Get a token (POST /auth/agent with the card number)
3. Check the patron's account (v1:patron.get) — note any overdue items
4. Browse the catalog (v1:catalog.list)
5. Get details on an item (v1:item.get)
6. If the patron wants to reserve an item:
   a. Check for overdue items first (v1:patron.get)
   b. If overdue items exist, return them (v1:item.return for each)
   c. Then reserve the desired item (v1:item.reserve)
7. Report results back to the user

## Important notes

- This is a demo. The catalog contains ~200 items with synthetic data.
- New patrons start with overdue items. This is by design — it demonstrates how the API
  communicates business rules through domain errors.
- The patron CAN return overdue items via v1:item.return. Once all overdue items are
  returned, reservations will succeed.
- Domain errors (like "overdue items exist") come back as HTTP 200 with state: "error".
  This is different from protocol errors (400, 401, 403) which indicate a problem with
  the request itself, not with the business logic.
- Some operations in the registry (v1:patron.fines, v1:catalog.bulkImport) require scopes
  you don't have. If you try to call them, you'll get a 403 with a clear error message
  about which scope is missing.
```

### Key design decisions

- **Library card number as agent entry point.** The agent must ask the user for their card number before doing anything. This creates a realistic interaction pattern (like a librarian asking "Can I see your library card?") and ties the agent's actions to a specific patron.
- **Fixed agent scopes.** Agents get `items:browse`, `items:read`, `items:write`, `patron:read` — enough to browse, return items, and reserve, but not to generate reports or access billing. This is deliberate scoping.
- **Plain markdown, not structured JSON or YAML.** LLMs are better at reading natural language instructions than parsing structured configs. The document is written conversationally, like you'd explain the API to a colleague.
- **Includes the full auth flow.** An agent shouldn't need to figure out authentication by trial and error. The instructions tell it exactly how to get a token and where to use it.
- **Points to `/.well-known/ops` for schemas.** The instructions give a summary of operations but direct the agent to the registry for the authoritative schemas. This means the instructions don't go stale when operations change.
- **Describes the "scripted" scenario.** The agent is told upfront that overdue items exist and how to handle them. This isn't a secret — it's the demo narrative. The agent should handle it gracefully, not be surprised by it.
- **No "on behalf of" semantics.** The agent's token IS the patron (via card number lookup). The agent acts as that patron directly.

---

## XState v5 design

### Operation instance machine

One machine definition, instantiated per async operation. Sync operations do not use XState — they execute inline and return immediately.

```typescript
import { setup, assign } from "xstate"

const operationMachine = setup({
  types: {
    context: {} as {
      requestId: string
      sessionId: string | undefined
      op: string
      args: Record<string, unknown>
      createdAt: number // Unix epoch seconds
      expiresAt: number // Unix epoch seconds
      resultLocation: string | null // GCS key, set on completion
      error: { code: string; message: string; cause?: unknown } | null
    },
    events: {} as { type: "START" } | { type: "COMPLETE"; resultLocation: string } | { type: "FAIL"; error: { code: string; message: string; cause?: unknown } },
  },
}).createMachine({
  id: "operation",
  initial: "accepted",
  states: {
    accepted: {
      on: {
        START: { target: "pending" },
        FAIL: {
          target: "error",
          actions: assign({ error: ({ event }) => event.error }),
        },
      },
    },
    pending: {
      on: {
        COMPLETE: {
          target: "complete",
          actions: assign({ resultLocation: ({ event }) => event.resultLocation }),
        },
        FAIL: {
          target: "error",
          actions: assign({ error: ({ event }) => event.error }),
        },
      },
    },
    complete: { type: "final" },
    error: { type: "final" },
  },
})
```

### State persistence

State is persisted to SQLite after each transition. The `lifecycle` service:

1. Creates an actor from the machine with initial context
2. Subscribes to state changes → writes to `operations` table
3. On polling (`GET /ops/{requestId}`), reads the latest state from SQLite and constructs the canonical response envelope
4. On server restart, does NOT rehydrate running machines — expired instances are cleaned up, completed/errored ones are read-only from SQLite

This keeps it simple. No in-memory actor persistence across restarts. The SQLite row IS the state.

---

## JSDoc → Registry generation

### Parser

At boot time, the registry is generated by:

1. Scanning all `.ts` files in `src/operations/`
2. Importing each module → reads `args` and `result` Zod schema exports
3. Calls `z.toJSONSchema()` (Zod v4 native) to convert to JSON Schema for the registry
4. Parses JSDoc from the exported `execute` function for metadata tags (`@op`, `@flags`, `@security`, `@timeout`, `@ttl`, `@cache`, `@deprecated`, `@sunset`, `@replacement`)
5. Assembles the registry object: `{ callVersion, operations }`
6. Caches the result in memory (rebuilt on restart)

The parser uses a simple regex/string approach on JSDoc blocks — no need for a full TypeScript AST parser. The `@tag value` format is straightforward to extract.

---

## Error codes

### Protocol errors (4xx)

| Code                       | HTTP | When                                                   |
| -------------------------- | ---- | ------------------------------------------------------ |
| `INVALID_ENVELOPE`         | 400  | Request body is not valid JSON or missing `op` field   |
| `UNKNOWN_OPERATION`        | 400  | `op` not found in registry                             |
| `SCHEMA_VALIDATION_FAILED` | 400  | `args` fail JSON Schema validation                     |
| `AUTH_REQUIRED`            | 401  | No `Authorization` header or invalid token             |
| `INSUFFICIENT_SCOPES`      | 403  | Token valid but missing required scopes                |
| `OPERATION_NOT_FOUND`      | 404  | `requestId` not found or expired on `/ops/{requestId}` |
| `METHOD_NOT_ALLOWED`       | 405  | `GET /call`                                            |
| `OP_REMOVED`               | 410  | Deprecated operation past sunset date                  |
| `RATE_LIMITED`             | 429  | Polling too frequently                                 |

### Domain errors (200 with `state=error`)

| Code                       | When                                                                                            |
| -------------------------- | ----------------------------------------------------------------------------------------------- |
| `ITEM_NOT_FOUND`           | `v1:item.get`, `v1:item.getMedia`, `v1:item.reserve`, or `v1:item.return` with unknown `itemId` |
| `ITEM_NOT_AVAILABLE`       | `v1:item.reserve` when item has no available copies                                             |
| `ITEM_NOT_CHECKED_OUT`     | `v1:item.return` when patron doesn't have this item checked out                                 |
| `OVERDUE_ITEMS_EXIST`      | `v1:item.reserve` when patron has overdue items                                                 |
| `ALREADY_RESERVED`         | `v1:item.reserve` when patron already has an active reservation for this item                   |
| `REPORT_GENERATION_FAILED` | `v1:report.generate` internal failure                                                           |

---

## Deployment

### Dockerfiles

**`api/Dockerfile`:**

```dockerfile
FROM oven/bun:latest
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
EXPOSE 3000
CMD ["bun", "run", "src/server.ts"]
```

**`app/Dockerfile`:**

```dockerfile
FROM oven/bun:latest
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
EXPOSE 3000
CMD ["bun", "run", "src/server.ts"]
```

### Deploy commands

```bash
# API server (Cloud Run)
gcloud run deploy opencall-api \
  --source ./api \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars GCS_BUCKET=opencall-demo-library

# App server (Cloud Run)
gcloud run deploy opencall-app \
  --source ./app \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars API_URL=https://api.opencall-api.com

# Brochure site + agent instructions (Firebase)
cd www && firebase deploy --only hosting
cd ../agents && firebase deploy --only hosting
```

### Environment variables

**API (`api.opencall-api.com`):**

| Var             | Description                                     |
| --------------- | ----------------------------------------------- |
| `GCS_BUCKET`    | GCS bucket name for media/reports               |
| `PORT`          | Server port (default 3000, Cloud Run sets 8080) |
| `DATABASE_PATH` | SQLite file path (default `./library.db`)       |
| `ADMIN_SECRET`  | Shared secret for `POST /admin/reset`           |

**App (`app.opencall-api.com`):**

| Var               | Description                                                       |
| ----------------- | ----------------------------------------------------------------- |
| `API_URL`         | Base URL for the API server (e.g. `https://api.opencall-api.com`) |
| `PORT`            | Server port (default 3000, Cloud Run sets 8080)                   |
| `SESSION_DB_PATH` | SQLite file path for sessions (default `./sessions.db`)           |
| `COOKIE_SECRET`   | Secret for signing `sid` cookies                                  |

---

## What this brief does NOT cover (deferred to SDD)

- Exact SQL schema DDL for all tables
- Seed script implementation details (Open Library API calls, faker config)
- Overdue item seeding logic (how items are assigned to new patrons on-the-fly)
- GCS signed URL mechanics
- Rate limiting algorithm
- Exact XState actor management code
- Test case specifications
- App proxy implementation details
- Envelope viewer component design (exact HTML/CSS/JS)
- Agent discovery standard selection (which `<meta>` / header / well-known convention wins)
- CI/CD pipeline
- Custom domain + SSL setup for all four subdomains
- CORS configuration between app ↔ api
- Cookie security details (signing, rotation)
- Monitoring / logging
- Library card number generation algorithm (uniqueness, formatting)
- Database reset implementation details (Cloud Scheduler config, reset script)
- Analytics: exact returning-visitor matching logic, admin query patterns, potential future admin dashboard
