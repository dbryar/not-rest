interface TokenEntry {
  scopes: string[];
}

let tokenStore = new Map<string, TokenEntry>();

export function registerToken(token: string, scopes: string[]): void {
  tokenStore.set(token, { scopes });
}

export function resetTokenStore(): void {
  tokenStore = new Map();
}

export function validateAuth(
  authHeader: string | null,
  requiredScopes: string[],
): { valid: true } | { valid: false; status: 401 | 403; code: string; message: string } {
  if (requiredScopes.length === 0) {
    return { valid: true };
  }

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return {
      valid: false,
      status: 401,
      code: "AUTH_REQUIRED",
      message: "Authorization header with Bearer token is required",
    };
  }

  const token = authHeader.slice(7);
  const entry = tokenStore.get(token);

  if (!entry) {
    return {
      valid: false,
      status: 401,
      code: "AUTH_REQUIRED",
      message: "Invalid or expired token",
    };
  }

  const hasAllScopes = requiredScopes.every((scope) => entry.scopes.includes(scope));
  if (!hasAllScopes) {
    return {
      valid: false,
      status: 403,
      code: "INSUFFICIENT_SCOPE",
      message: `Token lacks required scopes: ${requiredScopes.join(", ")}`,
    };
  }

  return { valid: true };
}
