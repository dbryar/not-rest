# OpenCALL Demo Library — Agent Instructions

## Overview

The OpenCALL Demo Library is a reference implementation of the OpenCALL protocol applied to a library catalog domain. This document provides instructions for AI agents to interact with the API at `api.opencall-api.com`.

All interactions use the OpenCALL protocol: a single `POST /call` endpoint with an envelope-based request/response format.

## Authentication

To interact with the API, you need a bearer token. Follow these steps:

1. **Ask the user for their library card number** (format: `XXXX-XXXX-XX`, e.g., `A1B2-C3D4-E5`)
2. **Call the agent auth endpoint**:

```
POST https://api.opencall-api.com/auth/agent
Content-Type: application/json

{ "cardNumber": "A1B2-C3D4-E5" }
```

3. **Response** (on success):

```json
{
  "token": "agent_abc123...",
  "username": "leaping-lizard",
  "patronId": "patron-uuid",
  "cardNumber": "A1B2-C3D4-E5",
  "scopes": ["items:browse", "items:read", "items:write", "patron:read"],
  "expiresAt": 1739580000
}
```

4. **Use the token** in all subsequent API calls via the `Authorization: Bearer {token}` header.

### Auth Errors

- **400 INVALID_CARD**: Card number missing or wrong format. Must be `XXXX-XXXX-XX`.
- **404 PATRON_NOT_FOUND**: No patron exists with that card number.

## Making API Calls

All operations use `POST /call`:

```
POST https://api.opencall-api.com/call
Content-Type: application/json
Authorization: Bearer agent_abc123...

{
  "op": "v1:catalog.list",
  "args": { "type": "book", "limit": 10 }
}
```

### Response Envelope

Every response follows the canonical envelope:

```json
{
  "requestId": "uuid",
  "state": "complete",
  "result": { ... }
}
```

The `state` field determines the outcome:
- `"complete"` — Success. Result is in `result`.
- `"error"` — Failure. Error details in `error.code` and `error.message`.
- `"accepted"` / `"pending"` — Async operation in progress. Poll `location.uri`.

## Available Operations

### Catalog Operations

| Operation | Description | Required Scope |
|-----------|-------------|----------------|
| `v1:catalog.list` | Browse/search the catalog with filters and pagination | `items:browse` |
| `v1:item.get` | Get full details for a catalog item by ID | `items:read` |
| `v1:item.getMedia` | Get cover image URL for a catalog item (returns 303 redirect) | `items:read` |

### Item Actions

| Operation | Description | Required Scope |
|-----------|-------------|----------------|
| `v1:item.reserve` | Reserve a catalog item | `items:write` |
| `v1:item.return` | Return a checked-out item | `items:write` |

### Patron Operations

| Operation | Description | Required Scope |
|-----------|-------------|----------------|
| `v1:patron.get` | Get patron profile, overdue items, and account summary | `patron:read` |
| `v1:patron.history` | Get lending history with filters | `patron:read` |

### Restricted Operations (Agent Cannot Access)

| Operation | Required Scope | Why Restricted |
|-----------|----------------|----------------|
| `v1:patron.fines` | `patron:billing` | Scope never granted to agents |
| `v1:catalog.bulkImport` | `items:manage` | Scope never granted to any user |
| `v1:report.generate` | `reports:generate` | Scope not granted to agents |

## Common Workflow

Here's a typical interaction pattern:

### Step 1: Authenticate
```json
POST /auth/agent
{ "cardNumber": "A1B2-C3D4-E5" }
```

### Step 2: Check patron status
```json
POST /call
{ "op": "v1:patron.get", "args": {} }
```
→ Check `overdueItems` array. If items are overdue, they must be returned before reserving new items.

### Step 3: Return overdue items
For each overdue item:
```json
POST /call
{ "op": "v1:item.return", "args": { "itemId": "item-uuid" } }
```

### Step 4: Browse the catalog
```json
POST /call
{ "op": "v1:catalog.list", "args": { "type": "book", "search": "science fiction", "available": true, "limit": 10 } }
```

### Step 5: Reserve an item
```json
POST /call
{ "op": "v1:item.reserve", "args": { "itemId": "item-uuid" } }
```

## Handling Domain Errors

Domain errors are returned as HTTP 200 with `state=error`:

| Error Code | Operations | Meaning | Recovery |
|------------|-----------|---------|----------|
| `ITEM_NOT_FOUND` | item.get, item.getMedia, item.reserve, item.return | Item ID doesn't exist | Verify the item ID from catalog.list |
| `ITEM_NOT_AVAILABLE` | item.reserve | No copies available | Try a different item or check back later |
| `ITEM_NOT_CHECKED_OUT` | item.return | Patron doesn't have this item | Check patron.get for actual checked-out items |
| `OVERDUE_ITEMS_EXIST` | item.reserve | Patron has overdue items | Return overdue items first (see error.cause.hint) |
| `ALREADY_RESERVED` | item.reserve | Already reserved this item | No action needed |

## Self-Description

Discover all available operations programmatically:

```
GET https://api.opencall-api.com/.well-known/ops
```

Returns the full operation registry with schemas, scopes, execution models, and caching policies.

## Notes

- Tokens expire after 24 hours
- The demo resets every 4 hours — your token may be invalidated
- All operations use the same `POST /call` endpoint
- Agent tokens carry scopes: `items:browse`, `items:read`, `items:write`, `patron:read`
- You cannot generate reports or view fines — these require scopes not granted to agents
