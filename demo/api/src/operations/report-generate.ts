import { z } from "zod/v4";
import type { OpContext, OperationResult } from "../call/dispatcher.ts";
import type { Database } from "bun:sqlite";
import { createOperation } from "../services/lifecycle.ts";
import { generateReport } from "../services/reports.ts";

/**
 * Generate a lending report asynchronously.
 *
 * @op v1:report.generate
 * @execution async
 * @timeout 30s
 * @ttl 1h
 * @security reports:generate
 * @flags sideEffecting idempotencyRequired
 */

export const args = z.object({
  format: z.enum(["csv", "json"]).optional().default("csv"),
  itemType: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export const result = z.object({
  location: z.string(),
  format: z.string(),
  generatedAt: z.string(),
});

export async function handler(
  input: unknown,
  ctx: OpContext,
  _db: Database
): Promise<OperationResult> {
  const parsed = input as z.infer<typeof args>;

  // 1. Create operation record in DB (state=accepted)
  createOperation(
    ctx.requestId,
    ctx.sessionId,
    "v1:report.generate",
    parsed,
    ctx.patronId,
    3600
  );

  // 2. Fire-and-forget: kick off report generation in the background
  generateReport(ctx.requestId, parsed, ctx.patronId);

  // 3. Return async accepted result
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;

  return {
    state: "accepted",
    location: { uri: `/ops/${ctx.requestId}` },
    retryAfterMs: 1000,
    expiresAt,
  };
}
