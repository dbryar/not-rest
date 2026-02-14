# Seed Data Generation

**Level**: 🏗️ Building
**Complexity**: 🟨 Moderate
**Convergence**: 📝 TODO
**Design**: 📝 TODO

## Summary

The demo requires realistic library catalog data to function. Without seed data, all operations return empty results, the reserve/return workflow can't be demonstrated, and the demo is essentially unusable.

## The Problem

### Requirements (from prompt.md and requirements.md)

1. **Catalog Items (~200)**
   - ~150 books from Open Library API (real metadata)
   - ~50 non-books (CDs, DVDs, board games) from faker
   - Each item has: id, type, title, creator, year, isbn?, description, tags, availability

2. **Patrons (~50)**
   - Faker-generated names
   - Stable card numbers (format: `XXXX-XXXX-XX`)
   - `is_seed = 1` flag for reset preservation

3. **Lending History (~5000 records)**
   - Distributed across patrons
   - Checkout dates, due dates (checkout + 14 days)
   - Return dates (null if still checked out)
   - Days late calculation

4. **Overdue Items (Critical for Demo Narrative)**
   - Every patron must have at least 2 overdue items
   - This ensures `v1:item.reserve` → `OVERDUE_ITEMS_EXIST` scenario works
   - The patron can then return items via `v1:item.return` to clear overdue status

5. **Cover Images (~50)**
   - Downloaded from Open Library Covers API
   - Uploaded to GCS bucket
   - Placeholder for items without covers

### Current State

From exploration, `seed.ts` exists but contains minimal stub code (~21 lines). The database will be empty at startup.

## Impact

Without seed data:
- `v1:catalog.list` returns empty array
- `v1:item.get` always returns `ITEM_NOT_FOUND`
- `v1:patron.get` can't show overdue items
- Reserve/return workflow is impossible
- Report generation has no data
- Demo is non-functional

## Dependencies

### External APIs

1. **Open Library API** (https://openlibrary.org/developers/api)
   - Search API: `https://openlibrary.org/search.json?q=fiction&limit=150`
   - Covers API: `https://covers.openlibrary.org/b/isbn/{isbn}-M.jpg`
   - Free, no auth required, CC0 data

2. **Faker** (already in Bun ecosystem)
   - Generate patron names, non-book items
   - `bun add @faker-js/faker`

3. **GCS** (for cover images)
   - Requires `@google-cloud/storage`
   - See gcs-integration concept

### Internal Dependencies

- Database schema must exist (`schema.sql` applied)
- GCS bucket must be configured for cover images

## Design Considerations

### Deterministic vs Random

**Option A: Fully Random**
- Different data each seed run
- Card numbers change between environments

**Option B: Seeded Random**
- Use fixed seed for faker
- Consistent data across environments
- Stable card numbers for testing

**Recommendation**: Option B — Use seeded randomness for consistency.

### Overdue Item Generation

Every patron needs 2+ overdue items. Approach:

1. Generate lending records with checkout dates 30-60 days ago
2. Due dates = checkout + 14 days (so 16-46 days ago)
3. `return_date = NULL` (still checked out)
4. `days_late` calculated from due date to "now"

### New Patron Seeding

When a new patron is created via `POST /auth`:

1. Create patron record
2. Generate 2-3 overdue lending records
3. Assign random catalog items that have available copies
4. This happens at auth time, not seed time

## Files Involved

- `demo/api/src/db/seed.ts` — Main seed script
- `demo/api/src/db/connection.ts` — Database access
- `demo/api/package.json` — Dependencies (faker)

## Implementation Outline

```typescript
// seed.ts
import { faker } from '@faker-js/faker';
import { db } from './connection';

// Set fixed seed for consistency
faker.seed(42);

async function seed() {
  // 1. Fetch books from Open Library
  const books = await fetchOpenLibraryBooks(150);

  // 2. Generate non-book items
  const nonBooks = generateNonBookItems(50);

  // 3. Insert all catalog items
  insertCatalogItems([...books, ...nonBooks]);

  // 4. Generate patrons
  const patrons = generatePatrons(50);
  insertPatrons(patrons);

  // 5. Generate lending history with overdue items
  generateLendingHistory(patrons, catalog, 5000);

  // 6. Download and upload cover images (if GCS configured)
  if (process.env.GCS_BUCKET) {
    await downloadAndUploadCovers(books, 50);
  }
}
```

## Next Steps

1. Add `@faker-js/faker` dependency
2. Implement Open Library API client
3. Implement catalog item generation
4. Implement patron generation with card numbers
5. Implement lending history generation
6. Implement overdue item seeding for new patrons (in auth handler)
7. Implement cover image download (after GCS integration)
