import { API_URL, type CallResponse } from "./client";

export async function pollOperation(
  requestId: string,
  token?: string,
): Promise<{ status: number; body: CallResponse }> {
  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`${API_URL}/ops/${requestId}`, { headers });
  const body = await res.json();
  return { status: res.status, body };
}

export async function waitForCompletion(
  requestId: string,
  timeoutMs = 5000,
  token?: string,
): Promise<CallResponse> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { body } = await pollOperation(requestId, token);
    if (body.state === "complete" || body.state === "error") {
      return body;
    }
    const delay = body.retryAfterMs || 100;
    await new Promise((r) => setTimeout(r, delay));
  }
  throw new Error(`Operation ${requestId} did not complete within ${timeoutMs}ms`);
}
