import type { Database } from "bun:sqlite";
import { lookupToken } from "./tokens.ts";
import { protocolError } from "../call/errors.ts";

/** Context derived from a successfully authenticated request */
export interface OpContext {
  requestId: string;
  sessionId?: string;
  patronId: string;
  username: string;
  scopes: string[];
  cardNumber?: string;
  tokenType?: "demo" | "agent";
  analyticsId?: string | null;
}

/**
 * Authenticate a request by extracting the Bearer token from the Authorization
 * header, looking it up in the database, and verifying it has not expired.
 *
 * Returns an OpContext on success, or a protocol error response on failure.
 */
export function authenticate(
  request: Request,
  db: Database
): OpContext | { status: number; body: import("../call/envelope.ts").ResponseEnvelope } {
  const authHeader = request.headers.get("Authorization");

  if (!authHeader) {
    return protocolError(
      "AUTH_REQUIRED",
      "Missing Authorization header",
      401
    );
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match || !match[1]) {
    return protocolError(
      "AUTH_REQUIRED",
      "Invalid Authorization header format, expected: Bearer {token}",
      401
    );
  }

  const tokenString = match[1];
  const token = lookupToken(db, tokenString);

  if (!token) {
    return protocolError(
      "AUTH_REQUIRED",
      "Invalid or unknown token",
      401
    );
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (token.expiresAt <= nowSeconds) {
    return protocolError(
      "AUTH_REQUIRED",
      "Token has expired",
      401
    );
  }

  return {
    requestId: "", // Will be set by the dispatcher
    patronId: token.patronId,
    username: token.username,
    scopes: token.scopes,
    tokenType: token.tokenType,
    analyticsId: token.analyticsId,
  };
}

/** Type guard to check if the result is an error response */
export function isAuthError(
  result: OpContext | { status: number; body: import("../call/envelope.ts").ResponseEnvelope }
): result is { status: number; body: import("../call/envelope.ts").ResponseEnvelope } {
  return "status" in result && "body" in result;
}
