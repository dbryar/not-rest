/** Shape of an auth token as encoded/decoded */
export interface AuthToken {
  token: string;
  tokenType: "demo" | "agent";
  username: string;
  patronId: string;
  scopes: string[];
  analyticsId: string | null;
  expiresAt: number; // Unix epoch seconds
}

/** Payload encoded inside the signed token */
interface TokenPayload {
  sub: string; // patronId
  usr: string; // username
  scp: string[]; // scopes
  typ: "demo" | "agent";
  aid: string | null; // analyticsId
  exp: number; // expiresAt (epoch seconds)
}

const SECRET = process.env.ADMIN_SECRET || "dev-secret";

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
  // Bun supports Node.js crypto.timingSafeEqual
  const { timingSafeEqual: tsEqual } = require("crypto");
  return tsEqual(bufA, bufB);
}

/** Create a signed token encoding all auth data. No DB needed. */
export function signToken(opts: {
  tokenType: "demo" | "agent";
  username: string;
  patronId: string;
  scopes: string[];
  analyticsId?: string | null;
  expiresAt: number;
}): string {
  const payload: TokenPayload = {
    sub: opts.patronId,
    usr: opts.username,
    scp: opts.scopes,
    typ: opts.tokenType,
    aid: opts.analyticsId ?? null,
    exp: opts.expiresAt,
  };
  const data = b64url(JSON.stringify(payload));
  const sig = hmacSign(data, SECRET);
  return `${data}.${sig}`;
}

/** Verify and decode a signed token. Returns AuthToken or null. */
export function verifyToken(token: string): AuthToken | null {
  const dotIndex = token.indexOf(".");
  if (dotIndex < 0) return null;

  const data = token.slice(0, dotIndex);
  const sig = token.slice(dotIndex + 1);

  const expected = hmacSign(data, SECRET);
  if (!timingSafeEqual(sig, expected)) return null;

  let payload: TokenPayload;
  try {
    payload = JSON.parse(b64urlDecode(data)) as TokenPayload;
  } catch {
    return null;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (payload.exp <= nowSeconds) return null;

  return {
    token,
    tokenType: payload.typ,
    username: payload.usr,
    patronId: payload.sub,
    scopes: payload.scp,
    analyticsId: payload.aid,
    expiresAt: payload.exp,
  };
}

/** Default token expiry: 24 hours from now (in seconds) */
export function tokenExpiresAt(): number {
  return Math.floor(Date.now() / 1000) + 86400;
}
