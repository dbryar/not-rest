# Scope Enforcement

**Level**: 🔧 Plumbing
**Complexity**: 🟨 Moderate
**Convergence**: 🟠 Evolving
**Design**: 🟢 Complete

## Summary

The demo uses OAuth2-style scopes to control access to operations. Each scope grants access to specific operations, and tokens can have any combination of scopes.

## Scope Matrix (8 scopes)

| Scope | Operations | Human | Agent |
|-------|------------|-------|-------|
| `items:browse` | `v1:catalog.list`, `v1:catalog.listLegacy` | Yes | Yes |
| `items:read` | `v1:item.get`, `v1:item.getMedia` | Yes | Yes |
| `items:write` | `v1:item.reserve` | Yes | Yes |
| `items:checkin` | `v1:item.return` | Yes | **No** |
| `items:manage` | `v1:catalog.bulkImport` | No | No |
| `patron:read` | `v1:patron.get`, `v1:patron.history` | Yes | Yes |
| `patron:billing` | `v1:patron.fines` | No | No |
| `reports:generate` | `v1:report.generate` | Yes | No |

## Why `items:checkin`?

The new scope creates a meaningful **physical-world boundary**:

1. **Agents can't physically return books** — A robot can't hand a book to a librarian
2. **Human-agent collaboration** — Agent must ask human to return items
3. **Better demo narrative** — Shows 403 scope errors in sequence with domain errors

## Implementation (Ready)

### Files to Update

1. **`demo/api/src/auth/scopes.ts`**:
   - Add `"items:checkin"` to `Scope` type
   - Split `SCOPE_OPERATIONS["items:write"]` to only include `v1:item.reserve`
   - Add `SCOPE_OPERATIONS["items:checkin"] = ["v1:item.return"]`
   - Add `items:checkin` to `HUMAN_DEFAULT_SCOPES`
   - Keep `AGENT_SCOPES` without `items:checkin`

2. **`demo/api/src/operations/item-return.ts`**:
   - Change `@security items:write` to `@security items:checkin`

3. **Tests to update**:
   - `demo/api/tests/auth.test.ts` — Verify scope sets
   - `demo/api/tests/call.test.ts` — Verify agent gets 403 on `v1:item.return`

## Token Scope Sets

### Human Default Scopes (6)

```typescript
const HUMAN_DEFAULT_SCOPES = [
  "items:browse",
  "items:read",
  "items:write",
  "items:checkin",  // NEW
  "patron:read",
  "reports:generate",
];
```

### Agent Fixed Scopes (4)

```typescript
const AGENT_SCOPES = [
  "items:browse",
  "items:read",
  "items:write",
  // NO items:checkin — agents cannot return physical items
  "patron:read",
];
```

### Never-Granted Scopes (2)

```typescript
// These scopes exist but are never granted to anyone:
// - items:manage (bulk import)
// - patron:billing (fines)
```

## Demo Narrative Impact

With `items:checkin` properly implemented:

1. Agent tries `v1:item.reserve` → **OVERDUE_ITEMS_EXIST** (domain error, 200)
2. Agent tries `v1:item.return` → **INSUFFICIENT_SCOPES** (403, missing `items:checkin`)
3. Agent tells human: "I can't return books — you'll need to do that"
4. Human returns books via app's `/account` page
5. Agent retries `v1:item.reserve` → **Success**

This demonstrates three protocol layers in sequence.
