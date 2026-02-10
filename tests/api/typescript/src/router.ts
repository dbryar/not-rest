import { ZodError } from "zod";
import { OPERATIONS, getIdempotencyStore, ServerError, type MediaFile } from "./operations";
import { validateAuth } from "./auth";

interface CallRequest {
  op: string;
  args: Record<string, unknown>;
  ctx?: {
    requestId?: string;
    sessionId?: string;
    idempotencyKey?: string;
    [key: string]: unknown;
  };
}

interface CallResponse {
  requestId: string;
  sessionId?: string;
  state: "complete" | "error" | "accepted" | "streaming";
  result?: unknown;
  error?: { code: string; message: string; cause?: Record<string, unknown> };
  retryAfterMs?: number;
  stream?: { transport: string; location: string; sessionId: string; encoding: string };
}

export function handleCall(
  envelope: CallRequest,
  authHeader: string | null = null,
  mediaFile?: MediaFile,
): {
  status: number;
  body: CallResponse;
} {
  const requestId = envelope.ctx?.requestId || crypto.randomUUID();
  const sessionId = envelope.ctx?.sessionId;

  const base: Pick<CallResponse, "requestId" | "sessionId"> = { requestId };
  if (sessionId) base.sessionId = sessionId;

  // Validate op is present and a string
  if (!envelope.op || typeof envelope.op !== "string") {
    return {
      status: 400,
      body: {
        ...base,
        state: "error",
        error: {
          code: "INVALID_REQUEST",
          message: "Missing or invalid 'op' field",
        },
      },
    };
  }

  // Look up operation
  const operation = OPERATIONS[envelope.op];
  if (!operation) {
    return {
      status: 400,
      body: {
        ...base,
        state: "error",
        error: {
          code: "UNKNOWN_OP",
          message: `Unknown operation: ${envelope.op}`,
        },
      },
    };
  }

  // Deprecated check — past sunset date means 410
  if (operation.deprecated && operation.sunset) {
    const sunsetDate = new Date(operation.sunset);
    if (new Date() > sunsetDate) {
      return {
        status: 410,
        body: {
          ...base,
          state: "error",
          error: {
            code: "OP_REMOVED",
            message: `Operation ${envelope.op} has been removed`,
            cause: {
              removedOp: envelope.op,
              replacement: operation.replacement || null,
            },
          },
        },
      };
    }
  }

  // Auth check
  if (operation.authScopes.length > 0) {
    const authResult = validateAuth(authHeader, operation.authScopes);
    if (!authResult.valid) {
      return {
        status: authResult.status,
        body: {
          ...base,
          state: "error",
          error: {
            code: authResult.code,
            message: authResult.message,
          },
        },
      };
    }
  }

  // Check idempotency store for side-effecting ops
  const idempotencyKey = envelope.ctx?.idempotencyKey;
  if (operation.sideEffecting && idempotencyKey) {
    const store = getIdempotencyStore();
    const cached = store.get(idempotencyKey);
    if (cached) {
      return cached as { status: number; body: CallResponse };
    }
  }

  // Execute handler
  try {
    // Stream operations
    if (operation.executionModel === "stream" && operation.streamHandler) {
      const streamResult = operation.streamHandler(envelope.args || {});
      if (!streamResult.ok) {
        return {
          status: 200,
          body: { ...base, state: "error", error: streamResult.error },
        };
      }
      return {
        status: 202,
        body: {
          ...base,
          state: "streaming",
          stream: {
            transport: "wss",
            location: `/streams/${streamResult.sessionId}`,
            sessionId: streamResult.sessionId,
            encoding: "json",
          },
        },
      };
    }

    // Async operations
    if (operation.executionModel === "async" && operation.asyncHandler) {
      const asyncResult = operation.asyncHandler(envelope.args || {}, requestId);
      if (!asyncResult.ok) {
        return {
          status: 200,
          body: { ...base, state: "error", error: asyncResult.error },
        };
      }
      return {
        status: 202,
        body: {
          ...base,
          state: "accepted",
          retryAfterMs: 100,
        },
      };
    }

    // Sync operations
    const result = operation.handler(envelope.args || {}, mediaFile);

    let response: { status: number; body: CallResponse };

    if (result.ok) {
      response = {
        status: 200,
        body: { ...base, state: "complete", result: result.result },
      };
    } else {
      // Domain error — HTTP 200
      response = {
        status: 200,
        body: { ...base, state: "error", error: result.error },
      };
    }

    // Store for idempotency
    if (operation.sideEffecting && idempotencyKey) {
      getIdempotencyStore().set(idempotencyKey, response);
    }

    return response;
  } catch (err) {
    if (err instanceof ZodError) {
      return {
        status: 400,
        body: {
          ...base,
          state: "error",
          error: {
            code: "VALIDATION_ERROR",
            message: err.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; "),
          },
        },
      };
    }

    if (err instanceof ServerError) {
      return {
        status: err.statusCode,
        body: {
          ...base,
          state: "error",
          error: {
            code: err.code,
            message: err.message,
          },
        },
      };
    }

    // Unexpected error
    return {
      status: 500,
      body: {
        ...base,
        state: "error",
        error: {
          code: "INTERNAL_ERROR",
          message: err instanceof Error ? err.message : "Unknown error",
        },
      },
    };
  }
}
