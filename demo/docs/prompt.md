# Project Brief: OpenCALL Demo — Public Lending Library

## Goal

Build a convincing **demo application** that implements the **OpenCALL v1.0** spec as a working system. The demo domain is a **public lending library** — patrons browse a catalog of physical items (books, CDs, DVDs, board games), view item details, retrieve cover images, return overdue items, reserve items for pickup, and generate lending-history reports.

The demo is split across four services (see **Environments** section for local vs remote URLs):

| Service | Purpose                                       | Remote domain             |
| ------- | --------------------------------------------- | ------------------------- |
| WWW     | Brochure/marketing site — explains the spec   | `www.opencall-api.com`    |
| App     | Demo app — interactive library dashboard      | `app.opencall-api.com`    |
| API     | OpenCALL API server — the spec implementation | `api.opencall-api.com`    |
| Agents  | Agent instructions — capability declaration   | `agents.opencall-api.com` |

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
- `POST /auth` — proxies to `${API_URL}/auth`, stores token in server-side session, sets `sid` cookie
- `GET /logout` — clears session + cookie

---

## Environments

All cross-service URLs are driven by environment variables, never hardcoded. The system runs in two modes:

### Local development

All four services run on `localhost` with different ports:

| Service | Local URL               | Port |
| ------- | ----------------------- | ---- |
| API     | `http://localhost:3000` | 3000 |
| App     | `http://localhost:8000` | 8000 |
| WWW     | `http://localhost:8080` | 8080 |
| Agents  | `http://localhost:8888` | 8888 |

Start locally with `bun run dev` in each service directory (or a root-level script that starts all four).

### Remote (production)

| Service | Remote URL                        | Hosting          |
| ------- | --------------------------------- | ---------------- |
| API     | `https://api.opencall-api.com`    | Cloud Run        |
| App     | `https://app.opencall-api.com`    | Cloud Run        |
| WWW     | `https://www.opencall-api.com`    | Firebase Hosting |
| Agents  | `https://agents.opencall-api.com` | Firebase Hosting |

### URL resolution

Every service that references another service uses environment variables to resolve URLs. No service hardcodes a domain name or port. The key variables:

| Variable     | Used by     | Local default           | Remote value                      |
| ------------ | ----------- | ----------------------- | --------------------------------- |
| `API_URL`    | App, Agents | `http://localhost:3000` | `https://api.opencall-api.com`    |
| `APP_URL`    | WWW, API    | `http://localhost:8000` | `https://app.opencall-api.com`    |
| `WWW_URL`    | App         | `http://localhost:8080` | `https://www.opencall-api.com`    |
| `AGENTS_URL` | App         | `http://localhost:8888` | `https://agents.opencall-api.com` |

These variables are used everywhere a cross-service URL appears:

- The app's client JS calls `${API_URL}/call` directly (with CORS)
- The app's `<meta>` tag and headers point to `${AGENTS_URL}/`
- The brochure CTA links to `${APP_URL}`
- The agent instructions reference `${API_URL}/auth/agent` and `${API_URL}/call`
- The envelope viewer shows `${API_URL}/call` as the request URL (matches Network tab)

The agent instructions markdown (`agents/index.md`) is a **template** — at build/serve time, `${API_URL}` placeholders are replaced with the actual value. Locally this means the agent instructions point to `http://localhost:3000`, which is correct for local testing.

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
│   │   ├── server.ts                  # Bun.serve() entry point — serves HTML + static files
│   │   ├── session.ts                 # Session store (SQLite) + cookie handling
│   │   ├── auth.ts                    # GET /auth page, POST /auth → mint token, return to browser
│   │   └── pages.ts                   # Page renderers (dashboard, catalog, account, etc.)
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
  id: string; // e.g. "book-978-0-14-028329-7"
  type: "book" | "cd" | "dvd" | "boardgame";
  title: string; // e.g. "The Great Gatsby"
  creator: string; // author / artist / publisher
  year: number; // publication year
  isbn?: string; // ISBN for books
  description: string; // 1-2 sentence blurb
  coverImageKey?: string; // GCS object key for cover image
  tags: string[]; // e.g. ["fiction", "classic", "american"]
  available: boolean; // is a copy currently on the shelf
  totalCopies: number; // how many copies the library owns
  availableCopies: number; // how many are currently available
};
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
  id: string; // e.g. "patron-leaping-lizard"
  username: string; // matches the auth token username
  name: string; // display name (faker-generated at seed, or username for demo users)
  cardNumber: string; // 10-digit library card number, e.g. "2810-4429-73"
  createdAt: string; // ISO 8601 datetime
};
```

**Library card numbers** are assigned to every patron at creation time. The format is `XXXX-XXXX-ZZ` (8 numeric digits and 2 letters that should be a checksum, hyphenated for readability). Pre-seeded patrons get stable card numbers. When a new patron is created via `POST /auth`, a new card number is generated and returned in the response.

**Card numbers for agents:** AI agents authenticate using a library card number (via `POST /auth/agent`). The human patron shares their card number with the agent — this is displayed prominently in the app dashboard (bottom-left corner, alongside the patron's name). The agent then uses this card number to get a token scoped specifically for agent operations.

**Key design choice:** When a demo user mints a token with username "leaping-lizard", they become patron "patron-leaping-lizard". The seed data pre-creates ~50 patrons with lending history. If a demo user happens to pick a seeded username, they inherit that patron's history (overdue items and all). If they pick a new username, a fresh patron is created — but **every new patron is seeded with at least 2 overdue items** so the reservation-blocked scenario works initially. This is the "scripted" part of the demo — but the patron CAN return overdue items to unblock reservations.

### Lending history (synthetic, for reports)

Generated by faker at seed time. Stored in SQLite. ~5,000 rows across ~50 pre-seeded patrons:

```typescript
type LendingRecord = {
  id: string;
  itemId: string;
  patronId: string; // e.g. "patron-leaping-lizard"
  patronName: string; // faker full name or username
  checkoutDate: string; // ISO 8601 date
  dueDate: string; // 14 days after checkout
  returnDate: string | null; // null if still out
  daysLate: number; // 0 if returned on time or early
  reservedDate: string | null; // date a hold was placed, if any
  collectionDelayDays: number | null; // days between "ready for pickup" and actual collection
};
```

**Overdue item seeding:** Every patron (pre-seeded and newly created) has at least 2 items checked out past their due date with `returnDate = null` and `daysLate > 0`. This ensures the `v1:item.reserve` → `OVERDUE_ITEMS_EXIST` scenario fires initially. The overdue items are real catalog items so the agent can look them up. However, patrons can return items via `v1:item.return` to clear their overdue status and then successfully reserve.

### Reservations

```typescript
type Reservation = {
  id: string;
  itemId: string;
  patronId: string;
  status: "pending" | "ready" | "collected" | "cancelled";
  reservedAt: string; // ISO 8601 datetime
  readyAt: string | null; // when the item became available for pickup
  collectedAt: string | null; // when the patron collected it
  cancelledAt: string | null; // if cancelled
};
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
 * @execution sync|async
 * @timeout 5s
 * @ttl 1h
 * @security scope1 scope2
 * @cache none|server|location
 * @flags sideEffecting? idempotencyRequired? deprecated?
 * @sunset 2026-06-01
 * @replacement v1:other.op
 */
```

**`@execution`** — the execution model: `sync`, `async`, or `stream`. Determines whether the operation returns immediately or uses polling.

**`@flags`** — space-separated boolean flags. Present means true, absent means false:

- `sideEffecting` → maps to `sideEffecting: true` in registry (mutating operations)
- `idempotencyRequired` → maps to `idempotencyRequired: true` (safe to retry)
- `deprecated` → marks the operation as deprecated in the registry

**`@security`** — space-separated scope names. AND logic: caller must have ALL listed scopes. Maps to `authScopes` in the registry.

**`@timeout`** — milliseconds as a number. Maps to `maxSyncMs` in the registry.

**`@ttl`** — seconds as a number. Maps to `ttlSeconds` in the registry.

**`@cache`** — caching policy. Maps directly to `cachingPolicy` in the registry.

### JSDoc → Registry field mapping

| JSDoc tag                    | Registry field        | Parsing                                              |
| ---------------------------- | --------------------- | ---------------------------------------------------- |
| `@op`                        | `op`                  | Direct string                                        |
| `@execution`                 | `executionModel`      | `sync`, `async`, or `stream`                         |
| `@flags sideEffecting`       | `sideEffecting`       | `true` if present                                    |
| `@flags idempotencyRequired` | `idempotencyRequired` | `true` if present                                    |
| `@flags deprecated`          | `deprecated`          | `true` if present                                    |
| `@security`                  | `authScopes`          | Split on space → string array                        |
| `@timeout`                   | `maxSyncMs`           | Duration string → ms: `5s` → `5000`, `200ms` → `200` |
| `@ttl`                       | `ttlSeconds`          | Duration string → sec: `1h` → `3600`, `5m` → `300`   |
| `@cache`                     | `cachingPolicy`       | Direct string: `none`, `server`, `location`          |
| `@sunset`                    | `sunset`              | ISO date string                                      |
| `@replacement`               | `replacement`         | Op name string                                       |

Duration parsing uses [dayjs](https://day.js.org/) with the duration plugin. Supported units: `ms`, `s`, `m`, `h`, `d`. Always include the unit — raw numbers are ambiguous.

If `sideEffecting` is absent from `@flags`, it defaults to `false`. If `idempotencyRequired` is absent, it defaults to `false`.

### Schema inference from Zod

Schemas are NOT in separate JSON files. Each operation module exports colocated Zod schemas (`args` and `result`):

```ts
import { z } from "zod";

export const args = z.object({
  type: z
    .enum(["book", "cd", "dvd", "boardgame"])
    .optional()
    .describe("Filter by item type"),
  search: z
    .string()
    .optional()
    .describe("Free-text search across title and creator"),
  available: z.boolean().optional().describe("Filter to only available items"),
  limit: z.number().int().min(1).max(100).default(20).describe("Page size"),
  offset: z.number().int().min(0).default(0).describe("Pagination offset"),
});

export const result = z.object({
  items: z.array(CatalogItemSummary),
  total: z.number().int().describe("Total matching items"),
  limit: z.number().int(),
  offset: z.number().int(),
});

/**
 * Lists catalog items with optional filtering and pagination.
 *
 * @op v1:catalog.list
 * @execution sync
 * @timeout 5s
 * @ttl 1h
 * @security items:browse
 * @cache server
 */
export async function v1CatalogList(
  input: z.infer<typeof args>,
  ctx: OpContext,
): Promise<z.infer<typeof result>> {
  return catalogListService(input, ctx);
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

`@execution sync` · `@security items:browse` · `@timeout 5s` · `@ttl 1h` · `@cache server`

**Args (Zod):**

```ts
export const args = z.object({
  type: z
    .enum(["book", "cd", "dvd", "boardgame"])
    .optional()
    .describe("Filter by item type"),
  search: z
    .string()
    .optional()
    .describe("Free-text search across title and creator"),
  available: z.boolean().optional().describe("Filter to only available items"),
  limit: z.number().int().min(1).max(100).default(20).describe("Page size"),
  offset: z.number().int().min(0).default(0).describe("Pagination offset"),
});
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
});
```

---

### `v1:catalog.listLegacy` — Deprecated alias

`@execution sync` · `@security items:browse` · `@timeout 5s` · `@ttl 1h` · `@cache server` · `@flags deprecated` · `@sunset 2026-06-01` · `@replacement v1:catalog.list`

Same args and result schemas as `v1:catalog.list`. The controller delegates directly to `v1:catalog.list`'s service function. Exists solely to demonstrate the deprecation lifecycle.

```ts
/**
 * Lists catalog items (legacy endpoint).
 *
 * @op v1:catalog.listLegacy
 * @execution sync
 * @timeout 5s
 * @ttl 1h
 * @security items:browse
 * @cache server
 * @flags deprecated
 * @sunset 2026-06-01
 * @replacement v1:catalog.list
 */
export async function v1CatalogListLegacy(
  input: z.infer<typeof args>,
  ctx: OpContext,
): Promise<z.infer<typeof result>> {
  return catalogListService(input, ctx);
}
```

---

### `v1:item.get` — Get item details

`@execution sync` · `@security items:read` · `@timeout 5s` · `@ttl 1h` · `@cache server`

**Args (Zod):**

```ts
export const args = z.object({
  itemId: z.string().describe("Catalog item ID"),
});
```

**Result (Zod):** Full `CatalogItem` Zod schema (all fields from the domain model).

**Domain error:** If `itemId` does not exist, return `state=error` with HTTP 200 and error code `ITEM_NOT_FOUND`. This is a domain error, not a protocol error — per spec, business failures use `state=error` inside a 200, not a 404.

---

### `v1:item.getMedia` — Get cover image URL

`@execution sync` · `@security items:read` · `@timeout 5s` · `@ttl 1h` · `@cache location`

**Args (Zod):**

```ts
export const args = z.object({
  itemId: z.string().describe("Catalog item ID"),
});
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

`@execution sync` · `@security items:checkin` · `@timeout 5s` · `@ttl 0s` · `@cache none` · `@flags sideEffecting idempotencyRequired`

**Args (Zod):**

```ts
export const args = z.object({
  itemId: z.string().describe("Catalog item ID to return"),
});
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
});
```

**Behavior:** Marks the lending record as returned (`returnDate = now`, recalculates `daysLate`). Increments the item's `availableCopies`. If this was the patron's last overdue item, reservations become unblocked.

**Domain errors:**

| Error code             | When                                      | Message                                     |
| ---------------------- | ----------------------------------------- | ------------------------------------------- |
| `ITEM_NOT_FOUND`       | `itemId` doesn't exist                    | "No catalog item found with ID '{itemId}'." |
| `ITEM_NOT_CHECKED_OUT` | Patron doesn't have this item checked out | "You do not have '{title}' checked out."    |

**The demo narrative:** This operation requires `items:checkin`, which agents do not have. When an agent tries `v1:item.return`, it gets a **403 Insufficient Scopes** — the error clearly identifies `items:checkin` as the missing scope. This forces the agent to tell the human: "I can't return books for you — you'll need to return them yourself, then I can reserve." The human returns books via the app's `/account` page (which has the scope), then tells the agent to retry the reservation.

This demonstrates:

1. Scope enforcement with clear, actionable error messages
2. Human-agent collaboration — the agent hits a physical-world boundary
3. State mutation (via the human) that affects subsequent agent operations
4. Domain errors with actionable messages that guide the caller

---

### `v1:item.reserve` — Reserve a catalog item for pickup

`@execution sync` · `@security items:write` · `@timeout 5s` · `@ttl 0s` · `@cache none` · `@flags sideEffecting idempotencyRequired`

**Args (Zod):**

```ts
export const args = z.object({
  itemId: z.string().describe("Catalog item ID to reserve"),
});
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
});
```

**Domain errors (HTTP 200 with `state=error`):**

| Error code            | When                                                   | Message                                                                                                                                    |
| --------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `OVERDUE_ITEMS_EXIST` | Patron has overdue items                               | "Reservations are not permitted while you have outstanding overdue items. You have {n} overdue item(s). Use v1:patron.get to see details." |
| `ITEM_NOT_FOUND`      | `itemId` doesn't exist                                 | "No catalog item found with ID '{itemId}'."                                                                                                |
| `ITEM_NOT_AVAILABLE`  | Item exists but `availableCopies` = 0                  | "'{title}' has no copies currently available for reservation."                                                                             |
| `ALREADY_RESERVED`    | Patron already has an active reservation for this item | "You already have an active reservation for '{title}'."                                                                                    |

**The demo narrative:** This operation is initially designed to fail. Every patron starts with overdue items, so the first `v1:item.reserve` call returns `OVERDUE_ITEMS_EXIST`. The error message tells the caller to check `v1:patron.get` — this guides both human users and AI agents into the next step of the interaction.

An agent encountering this will naturally:

1. Try `v1:item.reserve` → get `OVERDUE_ITEMS_EXIST` (domain error, HTTP 200)
2. Call `v1:patron.get` → see the overdue items
3. Try `v1:item.return` → get **403 Insufficient Scopes** (missing `items:checkin`)
4. Realize it cannot physically return books → tell the human to return them
5. Human returns books via the app's `/account` page
6. Human tells the agent the books are returned
7. Agent retries `v1:item.reserve` → success

This arc demonstrates three layers of the protocol in sequence: a domain error (business rule), a scope error (authorization boundary), and finally success — all discovered by the agent through protocol signals alone.

---

### `v1:patron.get` — Get current patron details including overdue items

`@execution sync` · `@security patron:read` · `@timeout 5s` · `@ttl 0s` · `@cache none`

**Args (Zod):**

```ts
export const args = z.object({});
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
  activeReservations: z
    .number()
    .int()
    .describe("Number of active reservations"),
  totalCheckedOut: z
    .number()
    .int()
    .describe("Total items currently checked out"),
});
```

**Behavior:** Always returns at least 2 overdue items for any new patron (see seed data design). This is intentional — it sets up the `v1:item.reserve` rejection scenario initially. The patron can clear overdue items by returning them via `v1:item.return`.

---

### `v1:patron.history` — Get lending history for the current patron

`@execution sync` · `@security patron:read` · `@timeout 5s` · `@ttl 5m` · `@cache server`

**Args (Zod):**

```ts
export const args = z.object({
  limit: z.number().int().min(1).max(100).default(20).describe("Page size"),
  offset: z.number().int().min(0).default(0).describe("Pagination offset"),
  status: z
    .enum(["active", "returned", "overdue"])
    .optional()
    .describe("Filter by lending status"),
});
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
});
```

---

### `v1:patron.fines` — Get outstanding fines for the current patron

`@execution sync` · `@security patron:billing` · `@timeout 5s` · `@ttl 0s` · `@cache none`

**This operation exists to demonstrate `403 Insufficient Scopes`.** The `patron:billing` scope is never granted to demo users or agents. Any call to this operation will return a `403` with a clear error envelope explaining which scope is missing.

**Args (Zod):**

```ts
export const args = z.object({});
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
});
```

---

### `v1:catalog.bulkImport` — Bulk import catalog items

`@execution async` · `@security items:manage` · `@timeout 30s` · `@ttl 1h` · `@cache none` · `@flags sideEffecting`

**This operation exists to demonstrate `403 Insufficient Scopes`.** The `items:manage` scope is never granted to demo users or agents. Any call to this operation will return a `403` with a clear error envelope explaining which scope is missing. It also appears in the registry as an async, mutating operation — giving visitors a sense of the full range of operation types.

**Args (Zod):**

```ts
export const args = z.object({
  source: z.enum(["openlibrary", "csv"]).describe("Import source"),
  query: z.string().optional().describe("Search query for Open Library import"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(500)
    .default(50)
    .describe("Maximum items to import"),
});
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
});
```

---

### `v1:report.generate` — Generate lending history report

`@execution async` · `@security reports:generate` · `@timeout 30s` · `@ttl 1h` · `@cache none` · `@flags sideEffecting idempotencyRequired`

**Args (Zod):**

```ts
export const args = z.object({
  format: z.enum(["csv", "json"]).default("csv").describe("Output format"),
  itemType: z
    .enum(["book", "cd", "dvd", "boardgame"])
    .optional()
    .describe("Filter by item type"),
  dateFrom: z
    .string()
    .date()
    .optional()
    .describe("Start date for report range"),
  dateTo: z.string().date().optional().describe("End date for report range"),
});
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
  "scopes": [
    "items:browse",
    "items:read",
    "items:write",
    "items:checkin",
    "patron:read",
    "reports:generate"
  ]
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
  "scopes": [
    "items:browse",
    "items:read",
    "items:write",
    "items:checkin",
    "patron:read",
    "reports:generate"
  ],
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
  // Note: no "items:checkin" — agents cannot return physical items
  "expiresAt": 1739368800
}
```

Agent tokens are always prefixed with `agent_` (vs `demo_` for human tokens). Agent tokens receive a fixed scope set: `items:browse`, `items:read`, `items:write`, `patron:read`. Agents cannot return items (no `items:checkin` — a robot can't hand a physical book to a librarian), generate reports, or access billing. When an agent tries `v1:item.return`, it gets a 403 with the missing scope clearly identified.

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

1. User visits the App root (any page).
2. App server checks for a `sid` cookie → looks up session in SQLite.
3. **No valid session?** → redirect to `/auth`.
4. **Auth page** shows:
   - A generated username (or the one from their existing session if they're changing scopes)
   - Checkboxes for scopes (all default scopes checked — see Scopes table)
   - If they already have a session, their current scopes are shown as checked, and they can add/remove
   - A "Start Demo" button (or "Update Scopes" if already authed)
5. User clicks the button → app `POST /auth` handler:
   - POSTs to `${API_URL}/auth` with `{ username, scopes }`
   - Receives `{ token, username, cardNumber, scopes, expiresAt }`
   - Creates a server-side session in SQLite: `{ sid, token, username, cardNumber, scopes, expiresAt }`
   - Sets `sid` cookie (HttpOnly, Secure, SameSite=Lax, path=/)
   - Redirects to `/` (dashboard)
6. **All subsequent requests:** App reads `sid` cookie → resolves session → uses the stored `token` in `Authorization: Bearer` header when calling the API.

**Session store:** SQLite table `sessions` with columns `sid`, `token`, `username`, `card_number`, `scopes` (JSON), `expires_at`, `created_at`. Sessions expire when the underlying API token expires (24 hours).

**Logout:** `GET /logout` clears the session from SQLite and removes the `sid` cookie, then redirects to `/auth`.

### Scopes

| Scope              | Grants access to                           | Default (human) | Agent  |
| ------------------ | ------------------------------------------ | --------------- | ------ |
| `items:browse`     | `v1:catalog.list`, `v1:catalog.listLegacy` | Yes             | Yes    |
| `items:read`       | `v1:item.get`, `v1:item.getMedia`          | Yes             | Yes    |
| `items:write`      | `v1:item.reserve`                          | Yes             | Yes    |
| `items:checkin`    | `v1:item.return`                           | Yes             | **No** |
| `items:manage`     | `v1:catalog.bulkImport`                    | **No**          | No     |
| `patron:read`      | `v1:patron.get`, `v1:patron.history`       | Yes             | Yes    |
| `patron:billing`   | `v1:patron.fines`                          | **No**          | No     |
| `reports:generate` | `v1:report.generate`                       | Yes             | No     |

**Human default set:** `items:browse`, `items:read`, `items:write`, `items:checkin`, `patron:read`, `reports:generate`. The user can uncheck any to test what happens when scopes are insufficient.

**Agent fixed set:** `items:browse`, `items:read`, `items:write`, `patron:read`. Agents cannot return items (no `items:checkin`), generate reports (no `reports:generate`), or access billing/bulk import. The missing `items:checkin` is intentional — it drives the demo's agent interaction arc (see below).

**Scopes that always 403:** `items:manage` and `patron:billing` are never granted to any user or agent. `items:checkin` is granted to humans but not agents — this creates the key demo scenario where the agent must ask the human to return overdue books before it can reserve.

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
  id: string; // UUID
  patronId: string | null; // linked after auth, e.g. "patron-leaping-lizard"
  cardNumber: string | null; // library card number, if authed
  username: string | null; // patron username, if authed
  userAgent: string; // raw User-Agent header
  ip: string; // client IP (X-Forwarded-For on Cloud Run, or remote address)
  referrer: string | null; // Referer header on first auth request
  pageViews: number; // incremented on each proxied page request (app server)
  apiCalls: number; // incremented on each POST /call
  createdAt: string; // ISO 8601 — first auth
  updatedAt: string; // ISO 8601 — last activity (updated on every request)
};
```

**Agents** — one row per agent token:

```typescript
type AnalyticsAgent = {
  id: string; // UUID
  visitorId: string; // FK → analytics_visitors.id (linked via card number at agent auth time)
  patronId: string; // the patron this agent acts as
  cardNumber: string; // the card number used to authenticate
  userAgent: string; // raw User-Agent header from the agent's auth request
  ip: string; // client IP
  apiCalls: number; // incremented on each POST /call made with this agent token
  createdAt: string; // ISO 8601 — agent token minted
  updatedAt: string; // ISO 8601 — last agent API call
};
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
- **CTA button: "Try the Demo" → `${APP_URL}`**

### Sections (scrollable)

1. **The problem** — condensed from README.md "The Problem" section
2. **The answer** — `POST /call` example, condensed from README.md
3. **Try it** — CTA to the demo app + curl examples against `${API_URL}`
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
- **Agent instructions callout** — brief note: "Want to try with an AI agent? Share your library card number (`2810-4429-73`) and point the agent to `${AGENTS_URL}`"

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

### Envelope viewer: data model

The client maintains two in-memory stores that drive the envelope viewer. Both are reset on page navigation (each page starts fresh).

**`requests` — `Map<number, RequestEntry>`** keyed by timestamp (ms since epoch) for chronological sorting:

```typescript
type RequestEntry = {
  timestamp: number; // Date.now() when the request was sent — also the Map key
  requestId: string; // from the response (links to responses Map)
  op: string; // e.g. "v1:catalog.list"
  method: string; // "POST"
  url: string; // "${API_URL}/call" (masked token in headers)
  headers: Record<string, string>;
  body: {
    op: string;
    args: Record<string, unknown>;
    ctx?: { requestId: string; sessionId?: string };
  };
};
```

**`responses` — `Map<string, ResponseEntry[]>`** keyed by `requestId`, storing an **array** of responses per request (captures the full async polling chain):

```typescript
type ResponseEntry = {
  timestamp: number; // when this response was received
  status: number; // HTTP status (200, 202, 303, 400, 403, etc.)
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
  timeMs: number; // round-trip time for this response
};
```

**Why arrays for responses:** A single request like `v1:report.generate` produces multiple responses — the initial `202 Accepted`, then polling responses with `state=pending`, then the final `state=complete`. Storing the full chain lets the viewer show the async lifecycle progression.

**Clear button:** Calls `requests.clear()` and `responses.clear()`, then re-renders.

### Envelope viewer: display

The viewer renders as a **vertically stacked pair** below (or beside) the page UI:

- **Top/left: Request list** — all entries from `requests`, sorted by timestamp (newest first or oldest first, user can toggle). Each row shows: timestamp, `op` name, HTTP status of latest response (color-coded).
- **Bottom/right: Response chain** — when a request is selected, shows all entries from `responses.get(requestId)` in chronological order. For sync operations this is a single response. For async operations it's the full polling chain.
- **Both visible simultaneously** when screen height allows — no tabs, no switching. If viewport is too short, the response panel scrolls independently.
- **Collapsible** — the entire viewer can be collapsed to focus on the page UI.
- **Syntax highlighting** — JSON keys, strings, numbers in different colors.
- **HTTP status** — shown prominently on each response, color-coded (2xx green, 3xx blue, 4xx amber, 5xx red).
- **Timing** — each response shows its round-trip time in ms.
- **Copy button** — copy a request as a curl command, or a response as raw JSON.

### Client-side implementation

The app's client-side JS (`app.js`) calls the API **directly** from the browser. This is essential for demo authenticity — developers inspecting the Network tab must see real OpenCALL envelopes, not proxy wrappers.

**Why direct calls matter:**

- Dev tools show the actual protocol traffic
- Envelope viewer matches what's in Network tab (no smoke and mirrors)
- Developers can copy/paste real requests
- Demo credibility depends on showing the real thing

**Token in browser:** The demo token is returned to the browser after auth. This is intentional:

- Demo tokens are disposable (24hr expiry)
- Prefixed with `demo_` (obviously not production credentials)
- No real data in the demo
- Production apps would use proper auth (OAuth, etc.)

**Flow:**

1. User authenticates via `/auth` → app server mints token via `${API_URL}/auth`
2. App server returns token to browser (stored in JS variable)
3. Browser calls `${API_URL}/call` directly with `Authorization: Bearer <token>`
4. Browser receives **real OpenCALL envelope** — no wrapper
5. Browser stores request/response in Maps and updates envelope viewer
6. Dev tools Network tab shows the same envelope as the viewer

**API call wrapper in app.js:**

```javascript
async function callAPI(op, args) {
  const requestId = crypto.randomUUID();
  const start = Date.now();

  const response = await fetch(`${API_URL}/call`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      op,
      args,
      ctx: { requestId },
    }),
  });

  const timeMs = Date.now() - start;
  const body = await response.json();

  // Store for envelope viewer
  requests.set(Date.now(), {
    timestamp: Date.now(),
    requestId: body.requestId,
    op,
    method: "POST",
    url: `${API_URL}/call`,
    headers: {
      Authorization: "Bearer ***",
      "Content-Type": "application/json",
    },
    body: { op, args, ctx: { requestId } },
  });

  const responseEntry = {
    timestamp: Date.now(),
    status: response.status,
    headers: Object.fromEntries(response.headers),
    body, // ← REAL OpenCALL envelope
    timeMs,
  };

  if (!responses.has(body.requestId)) {
    responses.set(body.requestId, []);
  }
  responses.get(body.requestId).push(responseEntry);

  return body;
}
```

The token is masked in the envelope viewer display (`Bearer ***`) but the actual request uses the real token. For async operations, the client auto-polls and appends each polling response to the same `requestId` entry in the `responses` Map.

**CORS:** The API server allows requests from the app origin (`${APP_URL}`).

---

## Agent discovery: `agents.opencall-api.com`

A single static markdown document served at the root. This is a **capability declaration** — it tells the agent what this service is, how to authenticate, and where to discover operations. It does NOT list operations, describe workflows, or prescribe behavior. The agent must discover everything else through the protocol itself.

**Why this matters for the demo:** The entire point of OpenCALL is that it's self-describing. If the agent instructions pre-script the workflow, the demo proves nothing. The real proof is an agent that reads the registry, encounters domain errors, interprets the error messages, and figures out multi-step workflows autonomously — all from protocol signals alone.

### How agents find it

The App service includes standard discovery hints, using `${AGENTS_URL}` to resolve the correct URL:

1. **`<meta>` tag in HTML `<head>`:**

   ```html
   <meta name="ai-instructions" content="${AGENTS_URL}/" />
   ```

2. **`X-AI-Instructions` response header** on all App responses:

   ```
   X-AI-Instructions: ${AGENTS_URL}/
   ```

3. **`/.well-known/ai-instructions`** on the App — redirects to `${AGENTS_URL}/`

4. **`robots.txt`** on the App:
   ```
   # AI agents: see ${AGENTS_URL}/ for API instructions
   User-agent: *
   Allow: /
   ```

Any of these paths gets the agent to the instructions page. The exact standard for AI agent discovery is still emerging — we include multiple approaches to maximize compatibility.

### Content of the agent instructions (served at Agents root)

The markdown is a **template** — `{{API_URL}}` placeholders are replaced with the actual `API_URL` value at build/serve time. Locally this resolves to `http://localhost:3000`, remotely to `https://api.opencall-api.com`.

```markdown
# OpenCALL Demo Library — AI Agent Access

This is a public lending library. It uses the OpenCALL API specification.

## Authentication

You need the patron's library card number to act on their behalf. Ask them for it —
it's a 10-digit number in the format `XXXX-XXXX-XX`.

    POST {{API_URL}}/auth/agent
    Content-Type: application/json

    { "cardNumber": "<patron-card-number>" }

The response includes a `token`. Use it as a bearer token on all subsequent requests:

    Authorization: Bearer <token>

## API

All operations use a single endpoint:

    POST {{API_URL}}/call
    Content-Type: application/json
    Authorization: Bearer <token>

    { "op": "<operation-name>", "args": { ... } }

Responses use a standard envelope with a `state` field (`complete`, `accepted`,
`pending`, or `error`). Read the `state` to determine what happened.

## Discovery

Discover all available operations, their schemas, and constraints:

    GET {{API_URL}}/.well-known/ops

This registry is the authoritative source for what you can do, what arguments each
operation accepts, and what it returns. Start here.
```

### Key design decisions

- **Capability declaration, not a script.** The agent instructions contain only what the agent cannot discover from the protocol: the auth mechanism (which is outside the spec), the base URL, and the existence of `/.well-known/ops`. Everything else — operations, schemas, error handling, multi-step workflows — must be discovered through the protocol. This is what the demo proves.
- **No operation listing.** The instructions do not list available operations. The agent reads `/.well-known/ops` to discover them. If the registry is well-designed, the agent doesn't need a cheat sheet.
- **No workflow scripting.** The instructions do not describe the overdue→return→reserve workflow. The agent encounters `OVERDUE_ITEMS_EXIST` as a domain error (HTTP 200, `state=error`) with a message like "You have 2 overdue item(s). Use v1:patron.get to see details." The agent follows the error's guidance — that's the protocol working as designed.
- **No scope pre-declaration.** The instructions do not tell the agent which scopes it has or which operations will 403. The agent discovers its permissions by reading the registry (which lists required scopes per operation) and by encountering 403 responses with clear error messages listing the missing scope.
- **Library card number as agent entry point.** The agent must ask the user for their card number before doing anything. This is the one piece of out-of-band information the agent needs. It creates a realistic interaction pattern (like a librarian asking "Can I see your library card?") and ties the agent's actions to a specific patron.
- **The demo's proof point.** A well-designed agent hitting this service should: (1) read the registry, (2) understand what operations exist and what they require, (3) call operations, (4) interpret domain errors and follow their guidance, (5) navigate multi-step workflows without prior knowledge. If this works, it proves OpenCALL's self-describing design is sufficient for autonomous agent interaction — no MCP server, no custom integration, no scripted behavior.
- **No "on behalf of" semantics.** The agent's token IS the patron (via card number lookup). The agent acts as that patron directly.

---

## XState v5 design

### Operation instance machine

One machine definition, instantiated per async operation. Sync operations do not use XState — they execute inline and return immediately.

```typescript
import { setup, assign } from "xstate";

const operationMachine = setup({
  types: {
    context: {} as {
      requestId: string;
      sessionId: string | undefined;
      op: string;
      args: Record<string, unknown>;
      createdAt: number; // Unix epoch seconds
      expiresAt: number; // Unix epoch seconds
      resultLocation: string | null; // GCS key, set on completion
      error: { code: string; message: string; cause?: unknown } | null;
    },
    events: {} as
      | { type: "START" }
      | { type: "COMPLETE"; resultLocation: string }
      | {
          type: "FAIL";
          error: { code: string; message: string; cause?: unknown };
        },
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
          actions: assign({
            resultLocation: ({ event }) => event.resultLocation,
          }),
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
});
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
4. Parses JSDoc from the exported `execute` function for metadata tags (`@op`, `@execution`, `@flags`, `@security`, `@timeout`, `@ttl`, `@cache`, `@sunset`, `@replacement`)
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
  --set-env-vars GCS_BUCKET=opencall-demo-library,APP_URL=https://app.opencall-api.com

# App server (Cloud Run)
gcloud run deploy opencall-app \
  --source ./app \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars API_URL=https://api.opencall-api.com,AGENTS_URL=https://agents.opencall-api.com,WWW_URL=https://www.opencall-api.com

# Brochure site (Firebase) — APP_URL baked at build time
APP_URL=https://app.opencall-api.com bun run build
cd www && firebase deploy --only hosting

# Agent instructions (Firebase) — API_URL baked at build time
API_URL=https://api.opencall-api.com bun run build
cd ../agents && firebase deploy --only hosting
```

### Environment variables

Cross-service URL variables (`API_URL`, `APP_URL`, `WWW_URL`, `AGENTS_URL`) are defined in the **Environments** section above. The tables below list service-specific variables only.

**API:**

| Var             | Description                                     |
| --------------- | ----------------------------------------------- |
| `APP_URL`       | App service URL (for CORS, redirects)           |
| `GCS_BUCKET`    | GCS bucket name for media/reports               |
| `PORT`          | Server port (default 3000, Cloud Run sets 8080) |
| `DATABASE_PATH` | SQLite file path (default `./library.db`)       |
| `ADMIN_SECRET`  | Shared secret for `POST /admin/reset`           |

**App:**

| Var               | Description                                             |
| ----------------- | ------------------------------------------------------- |
| `API_URL`         | API service URL (passed to browser for direct calls)    |
| `AGENTS_URL`      | Agents service URL (for discovery headers/meta tags)    |
| `WWW_URL`         | WWW service URL (for nav links)                         |
| `PORT`            | Server port (default 8000, Cloud Run sets 8080)         |
| `SESSION_DB_PATH` | SQLite file path for sessions (default `./sessions.db`) |
| `COOKIE_SECRET`   | Secret for signing `sid` cookies                        |

**WWW:**

| Var       | Description                              |
| --------- | ---------------------------------------- |
| `APP_URL` | App service URL (for "Try the Demo" CTA) |
| `PORT`    | Server port (default 8080)               |

**Agents:**

| Var       | Description                                         |
| --------- | --------------------------------------------------- |
| `API_URL` | API service URL (templated into agent instructions) |
| `PORT`    | Server port (default 8888)                          |

---

## What this brief does NOT cover (deferred to SDD)

- Exact SQL schema DDL for all tables
- Seed script implementation details (Open Library API calls, faker config)
- Overdue item seeding logic (how items are assigned to new patrons on-the-fly)
- GCS signed URL mechanics
- Rate limiting algorithm
- Exact XState actor management code
- Test case specifications
- CORS configuration for browser-to-API calls
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
