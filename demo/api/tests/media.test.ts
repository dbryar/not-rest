import { test, expect, describe } from "bun:test";
import { getSignedUrl, uploadReport, isGcsConfigured } from "../src/services/media.ts";

// Tests run without GCS_BUCKET set → mock mode

describe("media service (mock mode)", () => {
  test("isGcsConfigured returns false when GCS_BUCKET not set", () => {
    expect(isGcsConfigured()).toBe(false);
  });

  test("getSignedUrl returns mock URL for cover image", async () => {
    const url = await getSignedUrl("covers/book-001.jpg");
    expect(url).toBe("/mock-gcs/covers/book-001.jpg");
  });

  test("getSignedUrl returns mock URL for report", async () => {
    const url = await getSignedUrl("reports/abc-123.csv");
    expect(url).toBe("/mock-gcs/reports/abc-123.csv");
  });

  test("uploadReport returns object key with csv extension", async () => {
    const key = await uploadReport("req-001", "id,name\n1,test", "text/csv");
    expect(key).toBe("reports/req-001.csv");
  });

  test("uploadReport returns object key with json extension", async () => {
    const key = await uploadReport("req-002", '{"data":[]}', "application/json");
    expect(key).toBe("reports/req-002.json");
  });

  test("mock URLs are deterministic (same input = same output)", async () => {
    const url1 = await getSignedUrl("covers/test.jpg");
    const url2 = await getSignedUrl("covers/test.jpg");
    expect(url1).toBe(url2);
  });
});
