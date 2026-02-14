# GCS Integration

**Level**: 🔧 Plumbing
**Complexity**: 🟨 Moderate
**Convergence**: 📝 TODO
**Design**: 📝 TODO

## Summary

Google Cloud Storage is needed for storing cover images and generated reports. The `v1:item.getMedia` operation should return signed URLs, and `v1:report.generate` should upload reports to GCS.

## The Problem

### Requirements (from prompt.md)

1. **Cover Images**
   - ~50 images in `covers/` prefix
   - `v1:item.getMedia` returns 303 redirect with signed URL (1-hour expiry)
   - Placeholder for items without covers

2. **Generated Reports**
   - Stored in `reports/` prefix
   - Available via signed URL after generation completes
   - Also accessible via chunked retrieval

3. **Bucket**: `opencall-demo-library`

### Current State

From exploration:
- No `@google-cloud/storage` in dependencies
- `media.ts` service file not found in listing
- `item-get-media.ts` operation exists but may stub GCS

## Impact

Without GCS:
- `v1:item.getMedia` can't return signed URLs for covers
- `v1:report.generate` can't store reports
- No persistent storage for media assets

## Design

### Dependencies

```bash
bun add @google-cloud/storage
```

### Environment Variables

```
GCS_BUCKET=opencall-demo-library
GCS_PROJECT_ID=your-gcp-project
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

For Cloud Run, credentials are automatic via service account binding.

### Media Service Interface

```typescript
// src/services/media.ts

import { Storage } from '@google-cloud/storage';

const storage = new Storage();
const bucket = storage.bucket(process.env.GCS_BUCKET!);

export async function getSignedUrl(objectKey: string): Promise<string> {
  const [url] = await bucket.file(objectKey).getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + 60 * 60 * 1000, // 1 hour
  });
  return url;
}

export async function uploadReport(
  requestId: string,
  content: string,
  format: 'csv' | 'json'
): Promise<string> {
  const objectKey = `reports/${requestId}.${format}`;
  const file = bucket.file(objectKey);
  await file.save(content, {
    contentType: format === 'csv' ? 'text/csv' : 'application/json',
  });
  return objectKey;
}

export async function uploadCover(
  itemId: string,
  imageBuffer: Buffer
): Promise<string> {
  const objectKey = `covers/${itemId}.jpg`;
  const file = bucket.file(objectKey);
  await file.save(imageBuffer, {
    contentType: 'image/jpeg',
  });
  return objectKey;
}

export function getPlaceholderUrl(): string {
  return '/assets/placeholder-cover.png';
  // Or return a signed URL to assets/placeholder.jpg in GCS
}
```

### Operation Integration

**item-get-media.ts**:
```typescript
import { getSignedUrl, getPlaceholderUrl } from '../services/media';
import { getItem } from '../services/catalog';

async function handler(input, ctx) {
  const item = await getItem(input.itemId);

  if (!item) {
    return { ok: false, error: { code: 'ITEM_NOT_FOUND', message: '...' } };
  }

  if (item.coverImageKey) {
    const url = await getSignedUrl(item.coverImageKey);
    return { ok: true, redirect: url };
  }

  return { ok: true, result: { placeholder: true, uri: getPlaceholderUrl() } };
}
```

**report-generate.ts**:
```typescript
import { uploadReport, getSignedUrl } from '../services/media';

// In async report generation:
const objectKey = await uploadReport(requestId, reportContent, format);
const signedUrl = await getSignedUrl(objectKey);
// Transition operation to complete with location.uri = signedUrl
```

## Local Development

For local development without GCS:

```typescript
// src/services/media.ts

const USE_GCS = !!process.env.GCS_BUCKET;

export async function getSignedUrl(objectKey: string): Promise<string> {
  if (!USE_GCS) {
    // Return local file URL for development
    return `/local-media/${objectKey}`;
  }
  // ... real GCS logic
}
```

Serve local files via a static route in server.ts for development.

## Files Involved

- `demo/api/package.json` — Add @google-cloud/storage
- `demo/api/src/services/media.ts` — Create media service
- `demo/api/src/operations/item-get-media.ts` — Integrate media service
- `demo/api/src/operations/report-generate.ts` — Integrate for report storage
- `demo/api/src/db/seed.ts` — Upload covers during seeding

## Next Steps

1. Add `@google-cloud/storage` dependency
2. Create `media.ts` service
3. Update `item-get-media.ts` to use real GCS
4. Update `report-generate.ts` to upload to GCS
5. Add local development fallback
6. Test with real GCS bucket
