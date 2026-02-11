export const API_URL = process.env.API_URL || "http://localhost:3000"

export interface CallResponse {
  requestId: string
  sessionId?: string
  state: "complete" | "error" | "accepted" | "pending" | "streaming"
  result?: unknown
  error?: { code: string; message: string; cause?: Record<string, unknown> }
  location?: { uri: string; auth?: { credentialType: string; credential: string; expiresAt?: number } }
  stream?: { transport: string; location: string; sessionId: string; encoding?: string; expiresAt?: number }
  retryAfterMs?: number
  expiresAt?: number
}

export async function call(op: string, args: Record<string, unknown> = {}, ctx: Record<string, unknown> = {}): Promise<{ status: number; body: CallResponse }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (process.env.AUTH_TOKEN) {
    headers["Authorization"] = `Bearer ${process.env.AUTH_TOKEN}`
  }
  const res = await fetch(`${API_URL}/call`, {
    method: "POST",
    headers,
    body: JSON.stringify({ op, args, ctx }),
  })
  const body = await res.json()
  return { status: res.status, body }
}

export interface RegistryResponse {
  callVersion: string
  operations: Array<{
    op: string
    argsSchema: Record<string, unknown>
    resultSchema: Record<string, unknown>
    sideEffecting: boolean
    idempotencyRequired: boolean
    executionModel: string
    description?: string
    authScopes?: string[]
    deprecated?: boolean
    sunset?: string
    replacement?: string
    mediaSchema?: Record<string, unknown>
    supportedTransports?: string[]
    supportedEncodings?: string[]
    frameSchema?: Record<string, unknown>
    ttlSeconds?: number
  }>
}

export async function getRegistry(): Promise<{
  status: number
  body: RegistryResponse
  headers: Headers
}> {
  const res = await fetch(`${API_URL}/.well-known/ops`)
  const body = await res.json()
  return { status: res.status, body, headers: res.headers }
}

export async function waitForServer(url = API_URL, timeoutMs = 5000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/.well-known/ops`)
      if (res.ok) return
    } catch {
      // server not ready yet
    }
    await new Promise((r) => setTimeout(r, 495))
  }
  throw new Error(`Server at ${url} did not become ready within ${timeoutMs}ms`)
}
