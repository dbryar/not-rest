# App-to-API Communication

**Level**: 🏘️ Neighborhood
**Complexity**: 🟦 Simple
**Convergence**: 🟠 Evolving
**Design**: 🟢 Complete

## Summary

The app communicates with the API to demonstrate the OpenCALL protocol. The design has evolved from a server-side proxy to direct browser-to-API calls.

## Design Decision (Round 3)

**Old design (proxy)**: App server forwarded API calls and wrapped responses
**New design (direct)**: Browser calls API directly with CORS

The proxy approach was rejected because it undermined demo authenticity — dev tools showed fake envelopes.

**Resolution decisions**:
- Token storage: `sessionStorage`
- Token payload: Carries `sub` (patron ID) and `sid` (session ID)
- CORS: Credentials allowed
- Session state: Stateless between app and API (middleware extracts from token)

## New Design: Direct Browser-to-API Calls

### Why Direct Calls?

1. **Authenticity** — Dev tools Network tab shows real OpenCALL envelopes
2. **Transparency** — No wrapper format, no reconstruction
3. **Credibility** — Developers see the actual protocol
4. **Copy/paste** — Requests can be copied directly to curl

### Token in Browser

Demo tokens are returned to the browser after authentication:

```javascript
// After POST /auth succeeds, token is stored in JS
const token = authResponse.token;
```

**This is intentional:**
- Demo tokens are disposable (24hr expiry)
- Prefixed with `demo_` (obviously not production)
- No sensitive data in the demo
- Production apps would use proper auth (OAuth, etc.)

### API Call Flow

```
Browser                                            API Server
   │                                                   │
   │ POST ${API_URL}/call                              │
   │ Authorization: Bearer demo_xxx                    │
   │ { op: "v1:catalog.list", args: {...} }            │
   │ ─────────────────────────────────────────────────►│
   │                                                   │
   │◄──────────────────────────────────────────────────│
   │ { requestId: "...", state: "complete", ... }      │
   │                                                   │
   │ ← REAL OPENCALL ENVELOPE                          │
```

### CORS Configuration

The API server allows requests from the app origin:

```typescript
// api/src/server.ts
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.APP_URL || 'http://localhost:3001',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};
```

### Envelope Viewer Integration

The envelope viewer captures real traffic:

```javascript
async function callAPI(op, args) {
  const response = await fetch(`${API_URL}/call`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ op, args, ctx: { requestId } })
  });

  const body = await response.json();

  // Store REAL envelope
  responses.get(body.requestId).push({
    status: response.status,
    body,  // ← This IS the OpenCALL envelope
    timeMs: Date.now() - start
  });

  return body;
}
```

## What the App Server Still Does

The app server still handles:

1. **Authentication** — `POST /auth` mints token via API, returns to browser
2. **Session management** — Stores session info (username, scopes) for page rendering
3. **Page rendering** — Serves HTML pages with user context
4. **Static files** — CSS, JS, images

What it **no longer does**:

- ~~Proxy API calls~~
- ~~Wrap responses in { request, response } format~~
- ~~Hide token from browser~~

## Files Involved

| File | Purpose |
|------|---------|
| `app/src/auth.ts` | Mint token, return to browser |
| `app/public/app.js` | Direct API calls, envelope capture |
| `api/src/server.ts` | CORS headers for app origin |

## Migration from Proxy

If existing code uses proxy pattern:

1. Remove `/api/call` proxy endpoint
2. Remove `proxy.ts` (or repurpose for polling/chunks if needed)
3. Update auth to return token in response body
4. Update `app.js` to call API directly
5. Add CORS headers to API server
