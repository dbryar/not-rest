export interface Session {
  token: string;
  username: string;
  cardNumber: string;
  scopes: string[];
  analyticsVisitorId: string | null;
  expiresAt: number;
}

interface SessionPayload {
  tok: string;
  usr: string;
  cn: string;
  scp: string[];
  vid: string | null;
  exp: number;
}

const SECRET = process.env.COOKIE_SECRET || process.env.ADMIN_SECRET || "dev-cookie-secret";

/** Base64url encode (no padding) */
function b64url(data: Uint8Array | string): string {
  const str = typeof data === "string" ? btoa(data) : btoa(String.fromCharCode(...data));
  return str.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Base64url decode to string */
function b64urlDecode(s: string): string {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "==".slice(0, (4 - (s.length % 4)) % 4);
  return atob(padded);
}

/** Compute HMAC-SHA256 and return base64url */
function hmacSign(data: string, secret: string): string {
  const hasher = new Bun.CryptoHasher("sha256", secret);
  hasher.update(data);
  return b64url(hasher.digest() as Uint8Array);
}

/** Timing-safe comparison of two strings */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  const { timingSafeEqual: tsEqual } = require("crypto");
  return tsEqual(bufA, bufB);
}

export interface CreateSessionData {
  token: string;
  username: string;
  cardNumber: string;
  scopes: string[];
  analyticsVisitorId?: string | null;
  expiresAt: number;
}

/** Create a signed session cookie value. Returns the cookie value string. */
export function createSession(data: CreateSessionData): string {
  const payload: SessionPayload = {
    tok: data.token,
    usr: data.username,
    cn: data.cardNumber,
    scp: data.scopes,
    vid: data.analyticsVisitorId ?? null,
    exp: data.expiresAt,
  };
  const encoded = b64url(JSON.stringify(payload));
  const sig = hmacSign(encoded, SECRET);
  return `${encoded}.${sig}`;
}

/** Verify and decode a signed session cookie value. Returns Session or null. */
export function resolveSession(cookieValue: string): Session | null {
  const dotIndex = cookieValue.indexOf(".");
  if (dotIndex < 0) return null;

  const data = cookieValue.slice(0, dotIndex);
  const sig = cookieValue.slice(dotIndex + 1);

  const expected = hmacSign(data, SECRET);
  if (!timingSafeEqual(sig, expected)) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(b64urlDecode(data)) as SessionPayload;
  } catch {
    return null;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (payload.exp <= nowSeconds) return null;

  return {
    token: payload.tok,
    username: payload.usr,
    cardNumber: payload.cn,
    scopes: payload.scp,
    analyticsVisitorId: payload.vid,
    expiresAt: payload.exp,
  };
}
