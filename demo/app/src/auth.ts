import { createSession, resolveSession as verifySession, type Session } from "./session.ts";
import { proxyAuth } from "./proxy.ts";

const AGENTS_URL = process.env.AGENTS_URL || "http://localhost:8888";

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

const COOKIE_NAME = "session";

/**
 * Build a Set-Cookie header string for the session cookie.
 */
function buildSessionCookie(value: string, maxAge: number): string {
  const parts = [
    `${COOKIE_NAME}=${value}`,
    `Path=/`,
    `HttpOnly`,
    `SameSite=Lax`,
    `Max-Age=${maxAge}`,
  ];
  if (process.env.NODE_ENV === "production") {
    parts.push("Secure");
  }
  return parts.join("; ");
}

/**
 * Build a Set-Cookie header string that clears the session cookie.
 */
function buildClearCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

/**
 * Resolve a session from a request's cookies. Returns the session or null.
 */
export function resolveSession(req: Request): Session | null {
  const cookies = parseCookies(req.headers.get("Cookie"));
  const cookieValue = cookies[COOKIE_NAME];
  if (!cookieValue) return null;
  return verifySession(cookieValue);
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
  <meta name="ai-instructions" content="${AGENTS_URL}">
  <title>Sign In - OpenCALL Demo Library</title>
  <link rel="stylesheet" href="/app.css">
</head>
<body>
  <main class="auth-layout">
    <div class="auth-card">
      <div class="auth-header">
        <h1>OpenCALL Demo Library</h1>
        <p class="auth-subtitle">Interactive API Explorer</p>
      </div>

      ${resetBanner}

      <form method="POST" action="/auth" class="auth-form">
        <div class="form-group">
          <input type="text" id="username" name="username" placeholder="Enter a username or leave blank"
                 pattern="[a-z0-9\\-]+" title="Lowercase letters, numbers, and hyphens only">
        </div>

        <div class="scope-section">
          <div class="scope-section-label">Permissions</div>

          <label class="scope-row">
            <span class="scope-label">Browse catalog</span>
            <span class="toggle">
              <input type="checkbox" name="scopes" value="items:browse" checked>
              <span class="toggle-track"></span>
            </span>
          </label>
          <label class="scope-row">
            <span class="scope-label">View items</span>
            <span class="toggle">
              <input type="checkbox" name="scopes" value="items:read" checked>
              <span class="toggle-track"></span>
            </span>
          </label>
          <label class="scope-row">
            <span class="scope-label">Reserve items</span>
            <span class="toggle">
              <input type="checkbox" name="scopes" value="items:write" checked>
              <span class="toggle-track"></span>
            </span>
          </label>
          <label class="scope-row">
            <span class="scope-label">Return items</span>
            <span class="toggle">
              <input type="checkbox" name="scopes" value="items:checkin" checked>
              <span class="toggle-track"></span>
            </span>
          </label>
          <label class="scope-row">
            <span class="scope-label">View profile</span>
            <span class="toggle">
              <input type="checkbox" name="scopes" value="patron:read" checked>
              <span class="toggle-track"></span>
            </span>
          </label>
          <label class="scope-row">
            <span class="scope-label">Generate reports</span>
            <span class="toggle">
              <input type="checkbox" name="scopes" value="reports:generate" checked>
              <span class="toggle-track"></span>
            </span>
          </label>
        </div>

        <button type="submit" class="btn-signin">Sign In</button>
      </form>
    </div>

    <div class="auth-disclaimer">
      <p>This is a demo environment. Data resets periodically.</p>
      <p><a href="${AGENTS_URL}" target="_blank" rel="noopener">API documentation</a></p>
    </div>
  </main>
  <script src="/app.js"></script>
  <script>
    document.querySelector('.auth-form').addEventListener('submit', async function(e) {
      e.preventDefault();

      const form = e.target;
      const btn = form.querySelector('.btn-signin');
      btn.classList.add('loading');
      btn.disabled = true;
      btn.textContent = 'Signing in\u2026';

      const username = form.querySelector('#username').value.trim();
      const scopeCheckboxes = form.querySelectorAll('input[name="scopes"]:checked');
      const scopes = Array.from(scopeCheckboxes).map(cb => cb.value);

      const body = {};
      if (username) body.username = username;
      if (scopes.length > 0) body.scopes = scopes;

      try {
        const res = await fetch('/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          btn.classList.remove('loading');
          btn.disabled = false;
          btn.textContent = 'Sign In';
          alert('Authentication failed. Please try again.');
          return;
        }

        const data = await res.json();

        sessionStorage.setItem('opencall_token', data.token);
        sessionStorage.setItem('opencall_api_url', data.apiUrl);
        sessionStorage.setItem('opencall_user', JSON.stringify({
          username: data.username,
          cardNumber: data.cardNumber,
          scopes: data.scopes,
          expiresAt: data.expiresAt,
        }));

        window.location.href = '/';
      } catch (err) {
        console.error('Auth error:', err);
        btn.classList.remove('loading');
        btn.disabled = false;
        btn.textContent = 'Sign In';
        alert('Authentication failed. Please try again.');
      }
    });
  </script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

const API_URL = process.env.API_URL || "http://localhost:3000";

/**
 * Handle POST /auth - Process auth form submission.
 * Supports both JSON (returns token) and form-data (redirects to dashboard).
 */
export async function handleAuthSubmit(req: Request): Promise<Response> {
  const contentType = req.headers.get("Content-Type") || "";
  const isJson = contentType.includes("application/json");

  let authBody: { username?: string; scopes?: string[] } = {};

  if (isJson) {
    // JSON request from JavaScript
    const json = await req.json() as { username?: string; scopes?: string[] };
    if (json.username && json.username.trim()) {
      authBody.username = json.username.trim();
    }
    if (json.scopes && json.scopes.length > 0) {
      authBody.scopes = json.scopes;
    }
  } else {
    // Form submission (backward compatible)
    const formData = await req.formData();
    const username = formData.get("username") as string | null;
    const scopeValues = formData.getAll("scopes") as string[];

    if (username && username.trim()) {
      authBody.username = username.trim();
    }
    if (scopeValues.length > 0) {
      authBody.scopes = scopeValues;
    }
  }

  // Proxy to API
  const result = await proxyAuth(authBody, req.headers);

  if (result.status !== 200) {
    if (isJson) {
      return new Response(JSON.stringify({ error: "Authentication failed" }), {
        status: result.status,
        headers: { "Content-Type": "application/json" },
      });
    }
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

  // Create signed session cookie (stateless — no DB needed)
  const cookieValue = createSession({
    token: authData.token,
    username: authData.username,
    cardNumber: authData.cardNumber,
    scopes: authData.scopes,
    expiresAt: authData.expiresAt,
  });

  // Calculate max-age from expiresAt
  const maxAge = authData.expiresAt - Math.floor(Date.now() / 1000);

  if (isJson) {
    // Return JSON with token and apiUrl for browser storage
    return new Response(JSON.stringify({
      token: authData.token,
      username: authData.username,
      cardNumber: authData.cardNumber,
      scopes: authData.scopes,
      expiresAt: authData.expiresAt,
      apiUrl: API_URL,
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": buildSessionCookie(cookieValue, maxAge),
      },
    });
  }

  // Form submission - redirect to dashboard
  return new Response(null, {
    status: 302,
    headers: {
      Location: "/",
      "Set-Cookie": buildSessionCookie(cookieValue, maxAge),
    },
  });
}

/**
 * Handle GET /logout - Clear session cookie and redirect to auth page.
 */
export function handleLogout(req: Request): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: "/auth",
      "Set-Cookie": buildClearCookie(),
    },
  });
}
