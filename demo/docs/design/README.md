# OpenCALL Demo Library — Design Documentation

This directory contains design documentation for the OpenCALL Demo Library using the **Convergent Design System (CDS)** methodology.

## Quick Links

- [STATUS.md](STATUS.md) — Current design state and concept matrix
- [concepts/](concepts/) — Individual concept designs

## What is CDS?

CDS is a documentation methodology that tracks design concepts through iterative refinement until they stabilize. Each concept goes through rounds of exploration until it converges on a stable design ready for implementation.

## Current State

**CDS Round 3 (Conflict Resolution)** — ~95% implemented, 2 conflicts with resolution designed.

| Status                | Description                                          |
| --------------------- | ---------------------------------------------------- |
| 🟢 Resolved           | JSDoc format, Zod version, seed data, database reset |
| 🟠 Ready to implement | `items:checkin` scope, direct API calls              |

## Concept Structure

Each concept in `concepts/` follows this structure:

```
concepts/{concept-name}/
├── README.md      # Quick summary (100-300 lines)
├── problem.md     # Problem statement
├── design.md      # Architecture details
└── decisions.md   # Key choices with reasoning
```

## Priority Concepts

### Ready for Implementation

1. **scope-enforcement** — Add `items:checkin` scope for human-agent collaboration
2. **app-proxy-pattern** — Browser calls API directly with CORS (no proxy wrapper)

### Converged (Complete)

3. **jsdoc-registry-pipeline** — Uses `@execution sync|async`, `@flags`, duration units
4. **zod-schema-generation** — Uses `zod/v4` subpath export
5. **seed-data-generation** — 570 lines, 200 items, 50 patrons
6. **envelope-viewer** — Data model with `requests`/`responses` Maps
7. **database-reset** — 50 lines, fully implemented

### Evolving

8. **agent-collaboration** — Depends on scope-enforcement resolution

## How to Use

1. Start with [STATUS.md](STATUS.md) for overview
2. Check concept convergence status
3. Read specific concept README.md for context
4. Load design.md only when implementing

## Resolution Documents

Temporary analysis files are in `.agent.work/cds/`:

- `round3-conflict-resolution.md` — Implementation details for both conflicts
