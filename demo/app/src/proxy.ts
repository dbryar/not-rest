const API_URL = process.env.API_URL || "http://localhost:3000";

/**
 * Proxy a request to the API's POST /auth endpoint (human auth).
 * This is called by the app server when handling auth form submission.
 * The app server creates a session and returns the token to the browser.
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
