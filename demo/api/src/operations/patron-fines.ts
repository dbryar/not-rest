import { z } from "zod/v4";
import type { OpContext, OperationResult } from "../call/dispatcher.ts";
import type { Database } from "bun:sqlite";

/**
 * View patron fines and billing (always returns 403 - scope never granted).
 *
 * @op v1:patron.fines
 * @execution sync
 * @timeout 5s
 * @ttl 0s
 * @cache none
 * @security patron:billing
 */

export const args = z.object({});

export const result = z.object({
  fines: z.array(z.unknown()),
});

export async function handler(
  _input: unknown,
  _ctx: OpContext,
  _db: Database
): Promise<OperationResult> {
  return {
    state: "complete",
    result: {
      fines: [],
    },
  };
}
