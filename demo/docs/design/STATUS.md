# OpenCALL Demo Library — Design Status

**Project**: OpenCALL Demo Library
**CDS Round**: 5 (Gap Resolution — Complete)
**Last Updated**: 2026-02-14
**Source of truth**: `demo/docs/prompt.md`

## Overview

This CDS tracks the design health of the OpenCALL Demo Library. The demo is a multi-subdomain demonstration of the OpenCALL v1.0 specification:

- `api.opencall-api.com` — OpenCALL API server (11 operations)
- `app.opencall-api.com` — Interactive dashboard with split-pane envelope viewer
- `www.opencall-api.com` — Static brochure site
- `agents.opencall-api.com` — AI agent instructions

## Current State (Round 5 — All Gaps Resolved)

**Tests**: 88 API + 36 App = 124 passing, 0 failing
**Gap report**: `demo/docs/gap-report.md` — 14 gaps identified, **14/14 resolved**

| Component          | Implementation | Tests     | Gaps | Status            |
| ------------------ | -------------- | --------- | ---- | ----------------- |
| API Server         | 11/11 ops      | 8 files   | 0    | 🟢 Complete       |
| App Server         | All routes     | 2 files   | 0    | 🟢 Complete       |
| Brochure (WWW)     | Complete       | N/A       | 0    | 🟢 Complete       |
| Agent Instructions | Complete       | N/A       | 0    | 🟢 Complete       |
| Seed Data          | 570 lines      | N/A       | 0    | 🟢 Complete       |
| GCS Integration    | Mocked         | N/A       | 0    | 🟢 Documented     |
| Database Reset     | 50 lines       | N/A       | 0    | 🟢 Complete       |
| Docker/Scripts     | Complete       | N/A       | 0    | 🟢 Complete       |

---

## Gap Summary (from gap-report.md)

All 14 gaps resolved in Round 5:

| ID     | Description                                       | Status      |
| ------ | ------------------------------------------------- | ----------- |
| GAP-01 | agents/index.md rewritten (~40 lines, spec-compliant) | ✅ Resolved |
| GAP-02 | App AGENTS_URL from env var (5 locations fixed)   | ✅ Resolved |
| GAP-03 | App API_URL defaults to port 3000                 | ✅ Resolved |
| GAP-04 | App WWW_URL env var added with "About" link       | ✅ Resolved |
| GAP-05 | WWW runtime templating via Bun server             | ✅ Resolved |
| GAP-06 | XKCD image served locally                         | ✅ Resolved |
| GAP-07 | Comparison table expanded (JSON-RPC, SOAP, MCP, A2A) | ✅ Resolved |
| GAP-08 | GCS mock documented as intentional for demo       | ✅ Resolved |
| GAP-09 | docker-compose has all 4 services                 | ✅ Resolved |
| GAP-10 | run-local.sh starts www service                   | ✅ Resolved |
| GAP-11 | App tests use env var for AGENTS_URL              | ✅ Resolved |
| GAP-12 | catalog-list type uses z.enum                     | ✅ Resolved |
| GAP-13 | patron-get fields aligned (daysOverdue, type)     | ✅ Resolved |
| GAP-14 | item-reserve has @ttl/@cache JSDoc tags           | ✅ Resolved |

---

## Concept Coverage Matrix

| Concept                  | Level           | Complexity  | Convergence  | Design      | Gaps        |
| ------------------------ | --------------- | ----------- | ------------ | ----------- | ----------- |
| jsdoc-registry-pipeline  | 🔧 Plumbing     | 🟧 Complex  | 🟢 Converged | 🟢 Complete | —           |
| zod-schema-generation    | 🔧 Plumbing     | 🟨 Moderate | 🟢 Converged | 🟢 Complete | —           |
| seed-data-generation     | 🏗️ Building     | 🟨 Moderate | 🟢 Converged | 🟢 Complete | —           |
| gcs-integration          | 🔧 Plumbing     | 🟨 Moderate | 🟢 Converged | 🟢 Complete | —           |
| xstate-lifecycle         | 🔧 Plumbing     | 🟨 Moderate | 🟢 Converged | 🟢 Complete | —           |
| envelope-format          | 🛣️ Highway      | 🟦 Simple   | 🟢 Converged | 🟢 Complete | —           |
| auth-flow                | 🔧 Plumbing     | 🟨 Moderate | 🟢 Converged | 🟢 Complete | —           |
| scope-enforcement        | 🔧 Plumbing     | 🟨 Moderate | 🟢 Converged | 🟢 Complete | —           |
| domain-errors            | 🏘️ Neighborhood | 🟦 Simple   | 🟢 Converged | 🟢 Complete | —           |
| sync-operations          | 🏗️ Building     | 🟦 Simple   | 🟢 Converged | 🟢 Complete | —           |
| async-operations         | 🏗️ Building     | 🟨 Moderate | 🟢 Converged | 🟢 Complete | —           |
| chunked-retrieval        | 🏗️ Building     | 🟨 Moderate | 🟢 Converged | 🟢 Complete | —           |
| app-proxy-pattern        | 🏘️ Neighborhood | 🟦 Simple   | 🟢 Converged | 🟢 Complete | —           |
| envelope-viewer          | 🏗️ Building     | 🟨 Moderate | 🟢 Converged | 🟢 Complete | —           |
| analytics-tracking       | 🏘️ Neighborhood | 🟦 Simple   | 🟢 Converged | 🟢 Complete | —           |
| database-reset           | 🏘️ Neighborhood | 🟦 Simple   | 🟢 Converged | 🟢 Complete | —           |
| agent-collaboration      | 🏗️ Building     | 🟨 Moderate | 🟢 Converged | 🟢 Complete | —           |
| env-var-resolution       | 🔧 Plumbing     | 🟦 Simple   | 🟢 Converged | 🟢 Complete | —           |

### Legend

**Convergence**: 🟢 Converged · 🟡 Stable · 🟠 Evolving · 🔴 Regressed · 📝 TODO · ⚠️ Conflicting

**Design**: 🟢 Complete · 🟡 Partial · 📝 TODO · 🔴 Wrong (contradicts spec)

---

## Round History

### Round 1: Initial Analysis
- Identified 5 potential issues (4 resolved, 1 needs verification)
- Implementation ~95% complete

### Round 2: Design Alignment
- Synced prompt.md changes with CDS
- Found 2 conflicts: `items:checkin` scope, proxy wrapper authenticity

### Round 3: Conflict Resolution
- Implemented `items:checkin` scope (71 tests)
- Implemented direct API calls with CORS (36 tests)
- Both conflicts fully resolved

### Round 4: Post-Implementation Audit
- Audited all 4 services against prompt.md source of truth
- **14 gaps identified** (see `demo/docs/gap-report.md`)
- Critical finding: agents/index.md violates core spec principle
- Key theme: env var hardcoding across app and www services
- API core is solid (11/11 ops, all error codes, async lifecycle)
- Tests all passing (124 total) but some test assertions match wrong values

### Round 5: Gap Resolution (Current)
- **All 14 gaps resolved** across 4 parallel batches
- Batch 1: Rewrote agents/index.md to spec-compliant ~40 lines
- Batch 2: Fixed env var hardcoding across app (AGENTS_URL, API_URL, WWW_URL) and www (runtime templating)
- Batch 3: docker-compose now has all 4 services, GCS mock documented, API schemas aligned
- Batch 4: XKCD local asset, comparison table expanded, run-local.sh starts www
- All 18 concepts 🟢 Converged with 🟢 Complete design
- Tests: 88 API + 36 App = 124 passing, 0 failing

---

## Next Actions

All gaps resolved. No outstanding issues.

The demo is fully aligned with `demo/docs/prompt.md` source of truth.
