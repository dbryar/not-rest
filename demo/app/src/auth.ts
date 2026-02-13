import { createSession, getSession, deleteSession, type Session } from "./session.ts";
import { proxyAuth } from "./proxy.ts";

/**
 * Parse cookies from a Cookie header string into a key-value map.
 */
export function parseCookies(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};
  const cookies: Record<string, string> = {};
  for (const pair of cookieHeader.split(";")) {
    const [rawKey, ...rest] = pair.split("=");
    const key = rawKey?.trim();
    const value = rest.join("=").trim();
    if (key) cookies[key] = value;
  }
  return cookies;
}

/**
 * Build a Set-Cookie header string for the session cookie.
 */
function buildSessionCookie(sid: string, maxAge: number): string {
  const parts = [
    `sid=${sid}`,
    `Path=/`,
    `HttpOnly`,
    `SameSite=Lax`,
    `Max-Age=${maxAge}`,
  ];
  // Only add Secure in production (when not localhost)
  if (process.env.NODE_ENV === "production") {
    parts.push("Secure");
  }
  return parts.join("; ");
}

/**
 * Build a Set-Cookie header string that clears the session cookie.
 */
function buildClearCookie(): string {
  return "sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";
}

/**
 * Resolve a session from a request's cookies. Returns the session or null.
 */
export function resolveSession(req: Request): Session | null {
  const cookies = parseCookies(req.headers.get("Cookie"));
  const sid = cookies["sid"];
  if (!sid) return null;
  return getSession(sid);
}

/**
 * Handle GET /auth - Serve the auth page HTML.
 */
export function handleAuthPage(req: Request): Response {
  const url = new URL(req.url);
  const isReset = url.searchParams.get("reset") === "1";

  const resetBanner = isReset
    ? `<div class="banner banner-info">
        <p>The demo library has been reset. Please sign in again to get a new library card.</p>
      </div>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="ai-instructions" content="https://agents.opencall-api.com/">
  <title>Sign In - OpenCALL Demo Library</title>
  <link rel="stylesheet" href="/app.css">
</head>
<body class="auth-page">
  <main class="auth-container">
    <div class="auth-card">
      <div class="auth-header">
        <h1>OpenCALL Demo Library</h1>
        <p class="auth-subtitle">Interactive API Explorer</p>
      </div>

      ${resetBanner}

      <form method="POST" action="/auth" class="auth-form">
        <div class="form-group">
          <label for="username">Username <span class="optional">(optional)</span></label>
          <input type="text" id="username" name="username" placeholder="Leave blank for a random name"
                 pattern="[a-z0-9\\-]+" title="Lowercase letters, numbers, and hyphens only">
          <p class="form-hint">A library patron will be created for you with overdue items to explore.</p>
        </div>

        <fieldset class="form-group">
          <legend>API Scopes</legend>
          <p class="form-hint">Select which permissions your demo token should have:</p>

          <label class="checkbox-label">
            <input type="checkbox" name="scopes" value="items:browse" checked>
            <span>items:browse</span> <span class="scope-desc">- Search and list catalog items</span>
          </label>
          <label class="checkbox-label">
            <input type="checkbox" name="scopes" value="items:read" checked>
            <span>items:read</span> <span class="scope-desc">- View item details and media</span>
          </label>
          <label class="checkbox-label">
            <input type="checkbox" name="scopes" value="items:write" checked>
            <span>items:write</span> <span class="scope-desc">- Reserve and return items</span>
          </label>
          <label class="checkbox-label">
            <input type="checkbox" name="scopes" value="patron:read" checked>
            <span>patron:read</span> <span class="scope-desc">- View your patron profile and history</span>
          </label>
          <label class="checkbox-label">
            <input type="checkbox" name="scopes" value="reports:generate" checked>
            <span>reports:generate</span> <span class="scope-desc">- Generate library reports</span>
          </label>
        </fieldset>

        <button type="submit" class="btn btn-primary">Sign In &amp; Get Library Card</button>
      </form>

      <div class="auth-footer">
        <p>This is a demo environment. Data resets periodically.</p>
        <p>Explore the <a href="https://agents.opencall-api.com/" target="_blank" rel="noopener">API documentation</a> to learn more.</p>
      </div>
    </div>
  </main>
  <script src="/app.js"></script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

/**
 * Handle POST /auth - Process auth form submission.
 * Proxies to the API, creates a session, and redirects to dashboard.
 */
export async function handleAuthSubmit(req: Request): Promise<Response> {
  // Parse form data
  const formData = await req.formData();
  const username = formData.get("username") as string | null;
  const scopeValues = formData.getAll("scopes") as string[];

  // Build body for API auth
  const authBody: { username?: string; scopes?: string[] } = {};
  if (username && username.trim()) {
    authBody.username = username.trim();
  }
  if (scopeValues.length > 0) {
    authBody.scopes = scopeValues;
  }

  // Proxy to API
  const result = await proxyAuth(authBody, req.headers);

  if (result.status !== 200) {
    // Auth failed - redirect back to auth page with error
    return new Response(null, {
      status: 302,
      headers: { Location: "/auth" },
    });
  }

  const authData = result.body as {
    token: string;
    username: string;
    cardNumber: string;
    scopes: string[];
    expiresAt: number;
  };

  // Create server-side session
  const session = createSession({
    token: authData.token,
    username: authData.username,
    cardNumber: authData.cardNumber,
    scopes: authData.scopes,
    expiresAt: authData.expiresAt,
  });

  // Calculate max-age from expiresAt
  const maxAge = authData.expiresAt - Math.floor(Date.now() / 1000);

  return new Response(null, {
    status: 302,
    headers: {
      Location: "/",
      "Set-Cookie": buildSessionCookie(session.sid, maxAge),
    },
  });
}

/**
 * Handle GET /logout - Delete session and redirect to auth page.
 */
export function handleLogout(req: Request): Response {
  const cookies = parseCookies(req.headers.get("Cookie"));
  const sid = cookies["sid"];
  if (sid) {
    deleteSession(sid);
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: "/auth",
      "Set-Cookie": buildClearCookie(),
    },
  });
}
