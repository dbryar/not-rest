import { z } from "zod/v4";

/** Request envelope — the body of every POST /call */
export const RequestEnvelopeSchema = z.object({
  op: z.string(),
  args: z.record(z.string(), z.unknown()).optional().default({}),
  ctx: z
    .object({
      requestId: z.uuid(),
      sessionId: z.uuid().optional(),
      idempotencyKey: z.string().optional(),
    })
    .optional(),
  media: z
    .array(
      z.object({
        name: z.string(),
        mimeType: z.string(),
        ref: z.string().optional(),
        part: z.string().optional(),
      })
    )
    .optional(),
});

export type RequestEnvelope = z.infer<typeof RequestEnvelopeSchema>;

/** Response envelope states */
export type ResponseState = "complete" | "accepted" | "pending" | "error";

/** Canonical response envelope */
export interface ResponseEnvelope {
  requestId: string;
  sessionId?: string;
  state: ResponseState;
  result?: unknown;
  error?: {
    code: string;
    message: string;
    cause?: unknown;
  };
  location?: {
    uri: string;
    auth?: {
      credentialType: string;
      credential: string;
      expiresAt?: number;
    };
  };
  retryAfterMs?: number;
  expiresAt?: number;
}
