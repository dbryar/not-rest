# Zod Schema Generation

**Level**: 🔧 Plumbing
**Complexity**: 🟨 Moderate
**Convergence**: 🟢 Converged
**Design**: 🟢 Complete

## Summary

The registry needs to expose JSON Schema for each operation's `args` and `result`. The prompt.md specifies using Zod v4's native `z.toJSONSchema()` method, but the implementation uses Zod v3 which doesn't have this method.

## The Problem

### Prompt.md Specification (Lines 357-361)

> At boot time, the registry builder:
> 1. Scans `src/operations/*.ts`
> 2. Imports each module → reads `args` and `result` exports
> 3. **Calls `z.toJSONSchema()` (Zod v4 native)** to convert to JSON Schema

### Implementation Reality

From `demo/api/package.json`:
```json
{
  "dependencies": {
    "zod": "^3.25.0"
  }
}
```

From `demo/api/src/ops/registry.ts`:
```typescript
import { z } from "zod/v4";
// ...
argsSchema: z.toJSONSchema(mod.args),
```

**Finding**: The code imports from `"zod/v4"` subpath (Zod 3.25 includes a v4 beta export) and uses `z.toJSONSchema()`. This should work with the v4 beta subpath, but needs verification.

The `zod/v4` subpath in Zod 3.25 provides early access to v4 APIs. This is actually correct — the implementation is using the v4 beta correctly.

## Impact

**UPDATE**: After examining the code, this is actually implemented correctly. The code imports from `"zod/v4"` which is a subpath export in Zod 3.25+ that provides early access to v4 APIs including `z.toJSONSchema()`.

**This concept may be 🟢 Converged** — needs runtime verification that the v4 beta subpath works correctly.

## Options

### Option A: Upgrade to Zod v4

```bash
bun add zod@4
```

**Pros**:
- Matches prompt.md specification
- Native `z.toJSONSchema()` support
- Simpler code

**Cons**:
- Zod v4 may have breaking changes
- May require updating schema definitions
- Less ecosystem support (v4 is newer)

### Option B: Use zod-to-json-schema Package

```bash
bun add zod-to-json-schema
```

```typescript
import { zodToJsonSchema } from 'zod-to-json-schema';

const argsSchema = zodToJsonSchema(operation.args);
const resultSchema = zodToJsonSchema(operation.result);
```

**Pros**:
- Works with current Zod v3
- Well-tested, widely used
- No schema changes needed

**Cons**:
- Extra dependency
- Doesn't match prompt.md exactly
- May have subtle differences from native v4 output

### Option C: Inline Schema Definitions

Define JSON Schema separately from Zod schemas:

```typescript
export const args = z.object({ ... });
export const argsSchema = {
  type: "object",
  properties: { ... }
};
```

**Pros**:
- No dependency on conversion
- Full control over schema output

**Cons**:
- Schema drift risk (Zod and JSON Schema can diverge)
- Double maintenance burden
- Defeats purpose of "Zod as single source of truth"

## Recommendation

**Option B: Use zod-to-json-schema**

Reasons:
1. Minimal code changes
2. Proven library with good compatibility
3. Keeps Zod v3 (more stable ecosystem)
4. Can migrate to v4 later when it's more mature

## Files Involved

- `demo/api/package.json` — Dependencies
- `demo/api/src/ops/registry.ts` — Schema generation call site
- `demo/api/tests/registry.test.ts` — Schema validation tests

## Next Steps

1. Add `zod-to-json-schema` dependency
2. Update registry.ts to use `zodToJsonSchema()`
3. Verify generated schemas match expected format
4. Update prompt.md to reflect actual approach
