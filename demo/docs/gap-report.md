# Implementation Gap Report

**Date:** 2026-02-14
**Source of truth:** `demo/docs/prompt.md`
**Branch:** `demo-server`
**Tests:** 88 API + 36 App = 124 passing, 0 failing

---

## Summary

The API server is functionally complete (11/11 operations, all error codes, async lifecycle, chunking). The main gaps are in environment variable usage, the agents instructions document, and GCS integration. Each gap below is tagged with a priority and the files that need changing.

---

## GAP-01: Agents index.md pre-lists operations and scripts workflow [CRITICAL]

**Spec requirement (prompt.md lines 1508-1596):**
> "It does NOT list operations, describe workflows, or prescribe behavior."
> "No operation listing." / "No workflow scripting." / "No scope pre-declaration."

**Actual:** `demo/agents/index.md` contains:
- Lines 75-108: Four tables listing ALL operations with scopes
- Lines 109-143: A scripted 5-step workflow
- Lines 144-155: A domain error recovery guide table
- Line 92: Explicitly tells agent it lacks `items:checkin`

**Impact:** Defeats the entire self-describing protocol demonstration. Agents don't need `/.well-known/ops` or error interpretation.

**Fix:** Rewrite `index.md` to match the ~40-line template in prompt.md lines 1544-1584. Keep ONLY:
- Auth instructions (card number → `POST /auth/agent` → token)
- Single endpoint (`POST {{API_URL}}/call`)
- Discovery pointer (`GET {{API_URL}}/.well-known/ops`)

**Files:**
- `demo/agents/index.md` — rewrite

---

## GAP-02: App hardcodes AGENTS_URL instead of using env var [HIGH]

**Spec requirement (prompt.md lines 70-87):**
> Every service that references another service uses environment variables. No service hardcodes a domain name or port.

**Actual:** `https://agents.opencall-api.com/` is hardcoded in 5 locations:
- `demo/app/src/server.ts:8` — `AI_INSTRUCTIONS_URL` constant
- `demo/app/src/pages.ts:25` — `<meta>` tag
- `demo/app/src/auth.ts:72` — `<meta>` tag
- `demo/app/src/auth.ts:125` — link in auth page
- `demo/app/public/app.js:908` — agent instructions link

**Fix:** Read `AGENTS_URL` from `process.env.AGENTS_URL || "http://localhost:3003"` and pass it through to templates and client JS.

**Files:**
- `demo/app/src/server.ts`
- `demo/app/src/pages.ts`
- `demo/app/src/auth.ts`
- `demo/app/public/app.js`

---

## GAP-03: App API_URL defaults to port 8080 instead of 3000 [HIGH]

**Spec requirement (prompt.md lines 48-56):**
> API local URL: `http://localhost:3000` (port 3000)

**Actual:** Three app files default to `http://localhost:8080`:
- `demo/app/src/server.ts:10`
- `demo/app/src/proxy.ts:1`
- `demo/app/src/auth.ts:185`

**Fix:** Change defaults to `http://localhost:3000`.

**Files:**
- `demo/app/src/server.ts`
- `demo/app/src/proxy.ts`
- `demo/app/src/auth.ts`

---

## GAP-04: App missing WWW_URL env var usage [MEDIUM]

**Spec requirement (prompt.md line 77):**
> `WWW_URL` used by App for nav links.

**Actual:** No reference to `WWW_URL` anywhere in the app source. There's no link back to the brochure site.

**Fix:** Add `WWW_URL` env var and use it in the layout (e.g., "About OpenCALL" link in sidebar or footer pointing to `${WWW_URL}`).

**Files:**
- `demo/app/src/pages.ts` — add link in layout
- `demo/app/src/server.ts` — read env var

---

## GAP-05: WWW brochure hardcodes APP_URL [HIGH]

**Spec requirement (prompt.md lines 1764-1766):**
> `APP_URL=https://app.opencall-api.com bun run build` — URLs baked at build time.

**Actual:** `demo/www/index.html` hardcodes:
- Line 51: CTA `https://app.opencall-api.com`
- Line 128: curl example `https://api.opencall-api.com/call`
- Line 134: second CTA `https://app.opencall-api.com`

No build process exists. No package.json for www.

**Fix:** Either:
- (a) Add a simple build script that replaces `{{APP_URL}}` / `{{API_URL}}` placeholders, or
- (b) Serve www through a Bun server (like agents) that templates at runtime

**Files:**
- `demo/www/index.html` — use placeholders
- Create `demo/www/package.json` + build script (or `src/server.ts`)

---

## GAP-06: WWW missing local XKCD asset [LOW]

**Spec (prompt.md lines 203-205):**
> `assets/xkcd-927.png` — XKCD Standards comic

**Actual:** Hotlinks to `https://imgs.xkcd.com/comics/standards.png`. The `demo/www/assets/` directory doesn't exist.

**Fix:** Download XKCD 927 image to `demo/www/assets/xkcd-927.png` and reference locally.

**Files:**
- `demo/www/assets/xkcd-927.png` — create (download)
- `demo/www/index.html` — update img src

---

## GAP-07: WWW comparison table incomplete [LOW]

**Spec (prompt.md line 1216):**
> Summary table from comparisons.md (JSON-RPC, GraphQL, gRPC, SOAP, MCP, A2A)

**Actual:** Only compares REST, GraphQL, gRPC. Missing JSON-RPC, SOAP, MCP, A2A.

**Fix:** Add missing columns/rows to the comparison table.

**Files:**
- `demo/www/index.html`

---

## GAP-08: GCS integration mocked [MEDIUM]

**Spec (prompt.md lines 534-537):**
> Generate a signed URL (1 hour expiry) for cover images.

**Actual:** `item-get-media.ts` constructs a mock URL: `https://storage.googleapis.com/${bucket}/${key}`. No `@google-cloud/storage` dependency. Seed script doesn't download cover images from Open Library.

**Fix:** For demo purposes, either:
- (a) Implement real GCS signed URLs (production path), or
- (b) Use public bucket URLs (current approach is fine for demo, just document it)

This is acceptable for local dev but needs real GCS for production.

**Files:**
- `demo/api/src/services/media.ts` (if exists) or `operations/item-get-media.ts`
- `demo/api/package.json` — add `@google-cloud/storage` if going production

---

## GAP-09: docker-compose.yml missing www and agents services [MEDIUM]

**Spec (prompt.md lines 47-56):**
> All four services run locally.

**Actual:** `docker-compose.yml` only defines `api` and `app`. Missing `www` and `agents`.

**Fix:** Add `www` and `agents` services to docker-compose.yml.

**Files:**
- `demo/docker-compose.yml`

---

## GAP-10: run-local.sh doesn't start www service [LOW]

**Actual:** Script defines `WWW_PORT=3002` and `WWW_URL` variables but never starts a www server process. Only starts API (3000), Agents (3003), and App (3001).

**Fix:** Add www server startup (either a simple static file server or the Bun server).

**Files:**
- `demo/run-local.sh`

---

## GAP-11: App tests hardcode agents.opencall-api.com [MEDIUM]

**Actual:** `demo/app/tests/integration.test.ts` lines 40, 48, 295, 304 assert against the hardcoded production URL. If GAP-02 is fixed (env var), these tests need updating.

**Fix:** Update tests to use the env var value rather than the hardcoded production URL.

**Files:**
- `demo/app/tests/integration.test.ts`

---

## GAP-12: catalog-list.ts args.type uses string instead of enum [LOW]

**Spec (prompt.md lines 433-435):**
> `type: z.enum(["book", "cd", "dvd", "boardgame"]).optional()`

**Actual:** Uses `z.string().optional()` — more permissive than spec.

**Fix:** Change to `z.enum(["book", "cd", "dvd", "boardgame"]).optional()`.

**Files:**
- `demo/api/src/operations/catalog-list.ts`
- `demo/api/src/operations/catalog-list-legacy.ts` (if duplicated)

---

## GAP-13: patron-get result schema missing fields from spec [LOW]

**Spec (prompt.md lines 654-677):** Result includes `overdueItems` array with fields: `itemId`, `title`, `type`, `checkoutDate`, `dueDate`, `daysOverdue`.

**Actual:** Returns `lendingId`, `itemId`, `title`, `creator`, `checkoutDate`, `dueDate`, `daysLate`. Field name differs (`daysLate` vs `daysOverdue`) and includes `creator` not in spec, plus `lendingId` not in spec but `type` is missing.

**Fix:** Align field names with spec. Add `type`, rename `daysLate` to `daysOverdue`, consider removing `lendingId`/`creator` or keeping as extensions.

**Files:**
- `demo/api/src/operations/patron-get.ts`
- `demo/api/src/services/lending.ts`

---

## GAP-14: item-reserve missing @ttl and @cache JSDoc tags [LOW]

**Spec (prompt.md line 546):**
> `@ttl 0s` · `@cache none`

**Actual:** `item-reserve.ts` JSDoc is missing `@ttl` and `@cache` tags. Defaults work (ttl=0, cache=none for mutations) but explicit is better for registry accuracy.

**Fix:** Add `@ttl 0s` and `@cache none` to the JSDoc block.

**Files:**
- `demo/api/src/operations/item-reserve.ts`

---

## Priorities for Sub-Agent Dispatch

### Batch 1: Critical (blocks demo narrative)
- **GAP-01**: Rewrite agents/index.md (standalone, no dependencies)

### Batch 2: High (broken local dev)
- **GAP-02 + GAP-03 + GAP-04 + GAP-11**: App env var fixes (all related, do together)
- **GAP-05**: WWW env var / build process

### Batch 3: Medium (correctness)
- **GAP-08**: GCS integration (decide mock vs real)
- **GAP-09**: docker-compose additions
- **GAP-12 + GAP-13 + GAP-14**: API schema/JSDoc alignment

### Batch 4: Low (polish)
- **GAP-06**: XKCD local asset
- **GAP-07**: Comparison table expansion
- **GAP-10**: run-local.sh www startup
