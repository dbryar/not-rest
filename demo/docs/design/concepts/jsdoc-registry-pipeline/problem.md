# Problem: JSDoc-to-Registry Pipeline Mismatch

## Context

The OpenCALL demo uses JSDoc annotations on operation modules to generate the operation registry at boot time. This "code-as-documentation" approach eliminates schema drift between code and API documentation.

## Problem Statement

The `prompt.md` specification defines a JSDoc format that differs from what was actually implemented. This creates a fundamental inconsistency where:

1. The registry parser may not correctly extract metadata
2. Operation behavior may not match what the registry advertises
3. Clients relying on registry metadata may behave incorrectly

## Evidence

### Prompt.md (Lines 267-280)

```typescript
/**
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

### Actual Implementation (catalog-list.ts lines ~1-10)

```typescript
/**
 * @op v1:catalog.list
 * @execution sync
 * @timeout 5000
 * @ttl 3600
 * @security items:browse
 * @cache server
 */
```

### Key Differences

| Aspect | Prompt.md | Implementation |
|--------|-----------|----------------|
| Execution model | `@flags sync` (first token) | `@execution sync` |
| Side-effecting | `@flags cacheable` or `@flags mutating` | Not present |
| Idempotency | `@flags idempotent` | Not present |
| Timeout format | `200ms`, `5s` | `5000` (raw ms) |
| TTL format | `1h`, `30m`, `0` | `3600` (raw seconds) |

## Impact

### Immediate

- Registry may report wrong `sideEffecting` values (defaulting to false for all)
- Registry may report wrong `idempotencyRequired` values
- Duration parsing may fail or produce unexpected results

### Downstream

- Clients may cache mutating operations incorrectly
- Retry logic may not handle idempotency correctly
- AI agents reading registry may misunderstand operation characteristics

## Root Cause

The prompt.md was written as a specification but the implementation diverged during development, likely because:

1. `@execution` is more explicit than embedding execution model in `@flags`
2. Raw numbers are simpler to implement than duration parsing
3. The `sideEffecting`/`idempotencyRequired` flags were forgotten or deferred

## Constraints

1. **Must maintain registry output format** — The registry response shape must match the OpenCALL spec
2. **All 11 operations must be consistent** — Can't have mixed formats
3. **Parser must be robust** — Should handle missing tags with sensible defaults
4. **Minimize implementation changes** — Prefer fixing the spec over rewriting code

## Success Criteria

1. All JSDoc tags are consistently formatted across all operations
2. Registry parser correctly extracts all metadata
3. Registry output matches OpenCALL spec fields
4. Tests verify correct extraction of all fields
