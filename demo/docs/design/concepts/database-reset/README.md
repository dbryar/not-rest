# Database Reset

**Level**: 🏘️ Neighborhood
**Complexity**: 🟦 Simple
**Convergence**: 🟡 Stable
**Design**: 📝 TODO

## Summary

The demo database needs periodic reset to keep it clean for new visitors. Reset preserves seed data and analytics while wiping transient user data.

## The Problem

### Requirements (from prompt.md and requirements.md)

**Reset Schedule**:
- Every 4 hours via Cloud Scheduler
- Manual trigger via `POST /admin/reset` with ADMIN_SECRET

**Data That Resets**:
- All `auth_tokens`
- All `operations` (async operation state)
- All `reservations`
- Non-seed patrons (`is_seed = 0`)
- Non-seed lending records (`is_seed = 0`)
- Modified seed lending records (restore `return_date = NULL` for overdue items)

**Data That Persists**:
- Seed patrons (`is_seed = 1`)
- Catalog items (~200)
- Seed lending records (~5000, restored to original state)
- Analytics tables (never reset)
- GCS objects (cover images, reports)

**App-Side Effect**:
- Clear all sessions
- Next request from existing session returns 401
- App redirects to `/auth` with reset banner

### Current State

`reset.ts` exists but contains stub code (~15 lines).

## Design

### Reset Script

```typescript
// src/db/reset.ts

import { db } from './connection';

export function resetDatabase() {
  // Transaction for atomicity
  db.transaction(() => {
    // 1. Clear transient tables
    db.run('DELETE FROM auth_tokens');
    db.run('DELETE FROM operations');
    db.run('DELETE FROM reservations');

    // 2. Remove non-seed patrons
    db.run('DELETE FROM patrons WHERE is_seed = 0');

    // 3. Remove non-seed lending records
    db.run('DELETE FROM lending_history WHERE is_seed = 0');

    // 4. Restore seed lending records to overdue state
    // Set return_date back to NULL for seed records that were returned during session
    db.run(`
      UPDATE lending_history
      SET return_date = NULL,
          days_late = CAST(
            (julianday('now') - julianday(due_date)) AS INTEGER
          )
      WHERE is_seed = 1
        AND return_date IS NOT NULL
    `);

    // 5. Restore item availability to seed values
    // Reset available_copies based on seed lending records
    db.run(`
      UPDATE catalog_items
      SET available_copies = total_copies - (
        SELECT COUNT(*)
        FROM lending_history
        WHERE lending_history.item_id = catalog_items.id
          AND lending_history.return_date IS NULL
      )
    `);

    // Note: analytics_visitors and analytics_agents are NOT touched
  })();

  console.log('Database reset complete');
}
```

### Admin Endpoint

```typescript
// In server.ts route handler

if (path === '/admin/reset' && method === 'POST') {
  const authHeader = request.headers.get('Authorization');
  const expected = `Bearer ${process.env.ADMIN_SECRET}`;

  if (authHeader !== expected) {
    return new Response(JSON.stringify({
      requestId: crypto.randomUUID(),
      state: 'error',
      error: { code: 'UNAUTHORIZED', message: 'Invalid admin secret' }
    }), { status: 401 });
  }

  resetDatabase();

  // Notify app server to clear sessions
  if (process.env.APP_URL) {
    fetch(`${process.env.APP_URL}/api/reset`, { method: 'POST' });
  }

  return new Response(JSON.stringify({
    requestId: crypto.randomUUID(),
    state: 'complete',
    result: { message: 'Database reset successful' }
  }), { status: 200 });
}
```

### App-Side Session Clear

```typescript
// In app server.ts

if (path === '/api/reset' && method === 'POST') {
  // Only accept from localhost or internal network
  clearAllSessions();
  return new Response('Sessions cleared', { status: 200 });
}
```

### Cloud Scheduler Configuration

```yaml
# Cloud Scheduler job
name: opencall-demo-reset
schedule: "0 */4 * * *"  # Every 4 hours
timeZone: "UTC"
target:
  httpTarget:
    uri: "https://api.opencall-api.com/admin/reset"
    httpMethod: "POST"
    headers:
      Authorization: "Bearer ${ADMIN_SECRET}"
retryConfig:
  retryCount: 1
  maxBackoffDuration: "60s"
```

### User Experience After Reset

1. User has active session
2. Reset happens
3. User's next API call fails with 401
4. App redirects to `/auth?reset=true`
5. Auth page shows banner: "The demo has been reset. Please start a new session."

## Files Involved

- `demo/api/src/db/reset.ts` — Reset logic
- `demo/api/src/server.ts` — Admin endpoint
- `demo/app/src/server.ts` — Session clear endpoint
- `demo/app/src/session.ts` — `clearAllSessions()` function
- `demo/scripts/setup-scheduler.sh` — Cloud Scheduler setup

## Testing

```typescript
// tests/reset.test.ts

test('reset preserves seed data', async () => {
  // Create non-seed patron
  // Make API calls
  // Call reset
  // Verify seed patrons exist
  // Verify non-seed patron gone
  // Verify analytics preserved
});

test('reset restores overdue items', async () => {
  // Return an overdue item
  // Call reset
  // Verify item is overdue again
});
```

## Next Steps

1. Implement `reset.ts` with full logic
2. Add admin endpoint to server.ts
3. Add session clear to app server
4. Create Cloud Scheduler setup script
5. Test reset preserves correct data
