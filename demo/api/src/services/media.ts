/**
 * GCS media service — signed URL generation and report upload.
 *
 * When GCS_BUCKET is set and GOOGLE_APPLICATION_CREDENTIALS is available,
 * uses real GCS signed URLs. Otherwise falls back to mock/local URLs
 * suitable for local development.
 */

const GCS_BUCKET = process.env.GCS_BUCKET; // e.g. "opencall-demo-library"

/** Whether real GCS is configured */
export const isGcsConfigured = (): boolean => !!GCS_BUCKET;

/**
 * Generate a (signed) URL for a GCS object.
 *
 * - Production: signed GCS URL with configurable expiry (default 1 hour)
 * - Local dev (no GCS_BUCKET): returns a deterministic mock URL
 */
export async function getSignedUrl(
  objectKey: string,
  expiryMs: number = 3_600_000
): Promise<string> {
  if (!GCS_BUCKET) {
    // Mock mode — return a predictable local URL
    return `/mock-gcs/${objectKey}`;
  }

  // Real GCS signed URL via the REST API
  // Uses the metadata server or GOOGLE_APPLICATION_CREDENTIALS for signing
  try {
    const { Storage } = await import("@google-cloud/storage");
    const storage = new Storage();
    const [url] = await storage
      .bucket(GCS_BUCKET)
      .file(objectKey)
      .getSignedUrl({
        version: "v4",
        action: "read",
        expires: Date.now() + expiryMs,
      });
    return url;
  } catch (err) {
    // If GCS signing fails (e.g. no credentials), fall back to public URL
    console.error("GCS signed URL generation failed, falling back to public URL:", err);
    return `https://storage.googleapis.com/${GCS_BUCKET}/${objectKey}`;
  }
}

/**
 * Upload report data to GCS (or store locally in mock mode).
 *
 * Returns the object key (path within the bucket).
 */
export async function uploadReport(
  requestId: string,
  data: string,
  mimeType: string
): Promise<string> {
  const ext = mimeType === "text/csv" ? "csv" : "json";
  const objectKey = `reports/${requestId}.${ext}`;

  if (!GCS_BUCKET) {
    // Mock mode — no actual upload, just return the key
    return objectKey;
  }

  try {
    const { Storage } = await import("@google-cloud/storage");
    const storage = new Storage();
    const file = storage.bucket(GCS_BUCKET).file(objectKey);
    await file.save(data, { contentType: mimeType });
    return objectKey;
  } catch (err) {
    console.error("GCS upload failed:", err);
    throw err;
  }
}
