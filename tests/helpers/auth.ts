import { API_URL, type CallResponse } from "./client";

export const MASTER_TOKEN = "test-master-token-all-scopes";

export function generateToken(suffix: string): string {
  return `test-token-${suffix}-${Date.now()}`;
}

export async function callWithAuth(
  op: string,
  args: Record<string, unknown> = {},
  ctx: Record<string, unknown> = {},
  token: string = MASTER_TOKEN,
): Promise<{ status: number; body: CallResponse }> {
  const res = await fetch(`${API_URL}/call`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ op, args, ctx }),
  });
  const body = await res.json();
  return { status: res.status, body };
}

export async function callWithoutAuth(
  op: string,
  args: Record<string, unknown> = {},
  ctx: Record<string, unknown> = {},
): Promise<{ status: number; body: CallResponse }> {
  const res = await fetch(`${API_URL}/call`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op, args, ctx }),
  });
  const body = await res.json();
  return { status: res.status, body };
}

export async function registerToken(
  token: string,
  scopes: string[],
): Promise<void> {
  const res = await fetch(`${API_URL}/_internal/tokens`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, scopes }),
  });
  if (!res.ok) {
    throw new Error(`Failed to register token: ${res.status}`);
  }
}
