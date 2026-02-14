const BASE_URL = `http://localhost:${process.env.TEST_PORT || 9876}`;

export async function call(
  op: string,
  args?: Record<string, unknown>,
  ctx?: Record<string, unknown>,
  token?: string
) {
  const body: Record<string, unknown> = { op, args: args ?? {} };
  if (ctx) body.ctx = ctx;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}/call`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return { status: res.status, headers: res.headers, body: await res.json() };
}

export async function getRegistry() {
  const res = await fetch(`${BASE_URL}/.well-known/ops`);
  return { status: res.status, headers: res.headers, body: await res.json() };
}

export async function authenticate(opts?: {
  username?: string;
  scopes?: string[];
}) {
  const res = await fetch(`${BASE_URL}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts ?? {}),
  });
  return { status: res.status, body: await res.json() };
}

export async function authenticateAgent(cardNumber: string) {
  const res = await fetch(`${BASE_URL}/auth/agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cardNumber }),
  });
  return { status: res.status, body: await res.json() };
}

export async function poll(requestId: string) {
  const res = await fetch(`${BASE_URL}/ops/${requestId}`);
  return { status: res.status, body: await res.json() };
}

export async function getChunks(requestId: string, cursor?: string) {
  const url = cursor
    ? `${BASE_URL}/ops/${requestId}/chunks?cursor=${cursor}`
    : `${BASE_URL}/ops/${requestId}/chunks`;
  const res = await fetch(url);
  return { status: res.status, body: await res.json() };
}

export async function getRaw(path: string) {
  const res = await fetch(`${BASE_URL}${path}`);
  return { status: res.status, headers: res.headers, body: res };
}
