# JSDoc-to-Registry Pipeline

**Level**: 🔧 Plumbing
**Complexity**: 🟧 Complex
**Convergence**: 🟢 Converged
**Design**: 🟢 Complete

## Summary

The registry at `GET /.well-known/ops` is generated at boot time by parsing JSDoc annotations from operation modules. The prompt.md specification has been updated to match the cleaner implementation format.

## Resolved Format

The implementation uses a clear, semantic JSDoc format with human-readable duration units:

```typescript
/**
 * Human-readable description.
 *
 * @op v1:catalog.list
 * @execution sync
 * @timeout 5s
 * @ttl 1h
 * @security items:browse
 * @cache server
 */
```

For mutating operations:

```typescript
/**
 * @op v1:item.reserve
 * @execution sync
 * @timeout 5s
 * @security items:write
 * @flags sideEffecting idempotencyRequired
 */
```

### JSDoc → Registry Field Mapping

| JSDoc tag                    | Registry field        | Parsing                                    |
| ---------------------------- | --------------------- | ------------------------------------------ |
| `@op`                        | `op`                  | Direct string                              |
| `@execution`                 | `executionModel`      | `sync`, `async`, or `stream`               |
| `@flags sideEffecting`       | `sideEffecting`       | `true` if present                          |
| `@flags idempotencyRequired` | `idempotencyRequired` | `true` if present                          |
| `@flags deprecated`          | `deprecated`          | `true` if present                          |
| `@security`                  | `authScopes`          | Split on space → array                     |
| `@timeout`                   | `maxSyncMs`           | Duration → ms: `5s` → `5000`               |
| `@ttl`                       | `ttlSeconds`          | Duration → sec: `1h` → `3600`, `5m` → `300`|
| `@cache`                     | `cachingPolicy`       | `none`, `server`, `location`               |
| `@sunset`                    | `sunset`              | ISO date string                            |
| `@replacement`               | `replacement`         | Op name string                             |

Duration parsing uses dayjs with the duration plugin. Supported units: `ms`, `s`, `m`, `h`, `d`.

## Resolution

**Option B was chosen**: Align prompt.md to match the implementation.

The implementation format is cleaner because:
- `@execution` explicitly labels the execution model (clearer than first token of `@flags`)
- Raw numbers for timeouts/TTLs avoid parsing complexity
- `@flags` is reserved for boolean flags only
- All 11 operation files use consistent format

## Implementation Status

- ✅ Registry parser in `registry.ts` correctly handles format
- ✅ All 11 operation files use consistent JSDoc format
- ✅ prompt.md updated to match implementation
- ✅ Tests verify registry generation

## Files Involved

- `demo/api/src/ops/registry.ts` — Registry builder and JSDoc parser
- `demo/api/src/operations/*.ts` — All 11 operation files (consistent format)
- `demo/api/tests/registry.test.ts` — Registry validation tests
- `demo/docs/prompt.md` — Updated to match implementation
