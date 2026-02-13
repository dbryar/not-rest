import type { Session } from "./session.ts";

const API_URL = process.env.API_URL || "http://localhost:8080";

/**
 * Mask a token for display: show the prefix and replace the rest with "***"
 * e.g. "demo_abc123..." -> "demo_***"
 */
function maskToken(token: string): string {
  const underscoreIdx = token.indexOf("_");
  if (underscoreIdx === -1) return "***";
  return token.slice(0, underscoreIdx + 1) + "***";
}

/**
 * Proxy a request to the API's POST /call endpoint with the session's bearer token.
 */
export async function proxyCall(
  body: unknown,
  session: Session
): Promise<{
  status: number;
  response: unknown;
  request: { method: string; url: string; headers: Record<string, string>; body: unknown };
}> {
  const url = `${API_URL}/call`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.token}`,
  };

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const responseBody = await res.json();

  return {
    status: res.status,
    response: responseBody,
    request: {
      method: "POST",
      url,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${maskToken(session.token)}`,
      },
      body,
    },
  };
}

/**
 * Proxy a request to the API's POST /auth endpoint (human auth).
 */
export async function proxyAuth(
  body: unknown,
  headers: Headers
): Promise<{ status: number; body: unknown }> {
  const url = `${API_URL}/auth`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const responseBody = await res.json();
  return { status: res.status, body: responseBody };
}

/**
 * Proxy a request to the API's POST /auth/agent endpoint (agent auth).
 */
export async function proxyAgentAuth(
  body: unknown
): Promise<{ status: number; body: unknown }> {
  const url = `${API_URL}/auth/agent`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const responseBody = await res.json();
  return { status: res.status, body: responseBody };
}
