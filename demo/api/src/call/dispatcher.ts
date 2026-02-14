import type { Database } from "bun:sqlite";
import type { z } from "zod/v4";
import { RequestEnvelopeSchema, type ResponseEnvelope } from "./envelope.ts";
import { protocolError, domainError, DomainError } from "./errors.ts";
import { authenticate, isAuthError, type OpContext } from "../auth/middleware.ts";
import { getRequiredScopes } from "../auth/scopes.ts";

// Re-export OpContext for external consumers
export type { OpContext } from "../auth/middleware.ts";

/** Result returned from an operation handler */
export interface OperationResult {
  state: "complete" | "accepted";
  result?: unknown;
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

/** Interface that each operation module must implement */
export interface OperationModule {
  args: z.ZodType;
  result: z.ZodType;
  handler: (args: unknown, ctx: OpContext, db: Database) => Promise<OperationResult>;
  /** If set, the operation is deprecated. Contains the sunset ISO date. */
  sunset?: string;
  /** If set, the replacement operation name after deprecation */
  replacement?: string;
}

/** Registry of known operations, populated via registerOperations() */
const registry = new Map<string, OperationModule>();

/** Register a set of operation modules into the dispatcher registry */
export function registerOperations(modules: Map<string, OperationModule>): void {
  for (const [name, mod] of modules) {
    registry.set(name, mod);
  }
}

/** Get the current registry (for introspection, e.g. /.well-known/ops) */
export function getRegistry(): Map<string, OperationModule> {
  return registry;
}

/**
 * Main dispatcher: handles a POST /call request end-to-end.
 *
 * 1. Parse JSON body
 * 2. Validate request envelope
 * 3. Generate/extract requestId
 * 4. Look up operation in registry
 * 5. Authenticate via Bearer token
 * 6. Check required scopes
 * 7. Validate args with operation's Zod schema
 * 8. Check deprecation sunset
 * 9. Call handler and format response
 */
export async function dispatch(
  request: Request,
  db: Database
): Promise<{ status: number; body: ResponseEnvelope; ctx?: OpContext }> {
  // 1. Parse JSON body
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return protocolError(
      "INVALID_ENVELOPE",
      "Request body must be valid JSON",
      400
    );
  }

  // 2. Validate request envelope
  const parseResult = RequestEnvelopeSchema.safeParse(rawBody);
  if (!parseResult.success) {
    const message = parseResult.error.issues
      .map((i) => `${(i.path as (string | number)[]).join(".")}: ${i.message}`)
      .join("; ");
    return protocolError(
      "INVALID_ENVELOPE",
      `Invalid request envelope: ${message}`,
      400
    );
  }

  const envelope = parseResult.data;

  if (!envelope.op) {
    return protocolError(
      "INVALID_ENVELOPE",
      "Missing required field: op",
      400
    );
  }

  // 3. Generate requestId and extract sessionId
  const requestId = envelope.ctx?.requestId ?? crypto.randomUUID();
  const sessionId = envelope.ctx?.sessionId;

  // 4. Look up operation in registry
  const operation = registry.get(envelope.op);
  if (!operation) {
    return {
      status: 400,
      body: {
        requestId,
        sessionId,
        state: "error",
        error: {
          code: "UNKNOWN_OPERATION",
          message: `Unknown operation: ${envelope.op}`,
        },
      },
    };
  }

  // 5. Authenticate
  const authResult = authenticate(request);
  if (isAuthError(authResult)) {
    // Preserve requestId/sessionId in auth error responses
    authResult.body.requestId = requestId;
    authResult.body.sessionId = sessionId;
    return authResult;
  }

  // Populate the context with requestId and sessionId
  const ctx: OpContext = {
    ...authResult,
    requestId,
    sessionId,
  };

  // 6. Check required scopes
  const requiredScopes = getRequiredScopes(envelope.op);
  if (requiredScopes.length > 0) {
    const tokenScopes = new Set(ctx.scopes);
    const missing = requiredScopes.filter((s) => !tokenScopes.has(s));
    if (missing.length > 0) {
      return {
        status: 403,
        body: {
          requestId,
          sessionId,
          state: "error",
          error: {
            code: "INSUFFICIENT_SCOPES",
            message: `Missing required scopes: ${missing.join(", ")}`,
            cause: { missing },
          },
        },
      };
    }
  }

  // 7. Validate args with operation's Zod schema
  const argsResult = operation.args.safeParse(envelope.args);
  if (!argsResult.success) {
    const issues = argsResult.error.issues.map((i) => ({
      path: (i.path as (string | number)[]).join("."),
      message: i.message,
    }));
    return {
      status: 400,
      body: {
        requestId,
        sessionId,
        state: "error",
        error: {
          code: "SCHEMA_VALIDATION_FAILED",
          message: "Invalid operation arguments",
          cause: { issues },
        },
      },
    };
  }

  // 8. Check deprecation sunset
  if (operation.sunset) {
    const sunsetDate = new Date(operation.sunset);
    if (Date.now() > sunsetDate.getTime()) {
      return {
        status: 410,
        body: {
          requestId,
          sessionId,
          state: "error",
          error: {
            code: "OP_REMOVED",
            message: `Operation ${envelope.op} was removed on ${operation.sunset}`,
            cause: {
              removedOp: envelope.op,
              sunset: operation.sunset,
              replacement: operation.replacement,
            },
          },
        },
      };
    }
  }

  // 9. Call handler and format response envelope
  try {
    const opResult = await operation.handler(argsResult.data, ctx, db);

    const response: ResponseEnvelope = {
      requestId,
      sessionId,
      state: opResult.state,
    };

    if (opResult.result !== undefined) {
      response.result = opResult.result;
    }

    if (opResult.location) {
      response.location = opResult.location;
    }

    if (opResult.retryAfterMs !== undefined) {
      response.retryAfterMs = opResult.retryAfterMs;
    }

    if (opResult.expiresAt !== undefined) {
      response.expiresAt = opResult.expiresAt;
    }

    // Determine HTTP status:
    // - 202 for accepted (async) operations
    // - 303 for redirect responses (location set, no result body)
    // - 200 for normal complete responses
    let status: number;
    if (opResult.state === "accepted") {
      status = 202;
    } else if (opResult.location && !opResult.result) {
      status = 303;
    } else {
      status = 200;
    }

    return { status, body: response, ctx };
  } catch (err) {
    // Domain errors are expected business-logic errors (e.g. ITEM_NOT_FOUND)
    if (err instanceof DomainError) {
      return {
        status: 200,
        body: domainError(requestId, err.code, err.message, err.cause),
      };
    }
    // Anything else is an unexpected internal error
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: 500,
      body: domainError(requestId, "INTERNAL_ERROR", message),
    };
  }
}
