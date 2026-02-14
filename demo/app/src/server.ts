import { getDb } from "./db/connection.ts";
import { resolveSession, handleAuthPage, handleAuthSubmit, handleLogout } from "./auth.ts";
import { clearAllSessions } from "./session.ts";
import { renderDashboard, renderCatalog, renderItem, renderAccount, renderReports } from "./pages.ts";
import { join, dirname } from "node:path";
import type { Session } from "./session.ts";

const AGENTS_URL = process.env.AGENTS_URL || "http://localhost:8888";
const WWW_URL = process.env.WWW_URL || "http://localhost:8080";
const PUBLIC_DIR = join(dirname(new URL(import.meta.url).pathname), "..", "public");
const API_URL = process.env.API_URL || "http://localhost:3000";

/**
 * Fire-and-forget: notify the API to increment page views for a visitor.
 */
function trackPageView(session: Session): void {
  if (!session.analyticsVisitorId) return;
  fetch(`${API_URL}/admin/pageview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ visitorId: session.analyticsVisitorId }),
  }).catch(() => {
    // Fire-and-forget — ignore errors
  });
}

/**
 * Add standard headers to all responses.
 */
function addStandardHeaders(response: Response): Response {
  response.headers.set("X-AI-Instructions", AGENTS_URL);
  return response;
}

/**
 * Create an HTML response with standard headers.
 */
function htmlResponse(html: string, status = 200): Response {
  return addStandardHeaders(
    new Response(html, {
      status,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    })
  );
}

/**
 * Create a JSON response with standard headers.
 */
function jsonResponse(data: unknown, status = 200): Response {
  return addStandardHeaders(
    new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  );
}

/**
 * Redirect to /auth with standard headers.
 */
function redirectToAuth(): Response {
  return addStandardHeaders(
    new Response(null, {
      status: 302,
      headers: { Location: "/auth" },
    })
  );
}

/**
 * Require a valid session or redirect to /auth.
 * Returns the session if valid, or null (and the caller should return the redirect).
 */
function requireSession(req: Request): { session: Session } | { redirect: Response } {
  const session = resolveSession(req);
  if (!session) {
    return { redirect: redirectToAuth() };
  }
  return { session };
}

export function startServer() {
  // Initialize the session database on startup
  getDb();

  const port = parseInt(process.env.PORT || process.env.APP_PORT || "8000", 10);

  const server = Bun.serve({
    port,
    async fetch(request) {
      const url = new URL(request.url);
      const path = url.pathname;

      // ── Static assets ─────────────────────────────────────────────

      if (path === "/app.css" && request.method === "GET") {
        const file = Bun.file(join(PUBLIC_DIR, "app.css"));
        if (await file.exists()) {
          return addStandardHeaders(
            new Response(file, {
              headers: { "Content-Type": "text/css; charset=utf-8" },
            })
          );
        }
        return addStandardHeaders(
          new Response("/* empty */", {
            headers: { "Content-Type": "text/css; charset=utf-8" },
          })
        );
      }

      if (path === "/app.js" && request.method === "GET") {
        const file = Bun.file(join(PUBLIC_DIR, "app.js"));
        if (await file.exists()) {
          return addStandardHeaders(
            new Response(file, {
              headers: { "Content-Type": "application/javascript; charset=utf-8" },
            })
          );
        }
        return addStandardHeaders(
          new Response("// empty", {
            headers: { "Content-Type": "application/javascript; charset=utf-8" },
          })
        );
      }

      // ── AI / SEO routes ───────────────────────────────────────────

      if (path === "/.well-known/ai-instructions" && request.method === "GET") {
        return addStandardHeaders(
          new Response(null, {
            status: 302,
            headers: { Location: AGENTS_URL },
          })
        );
      }

      if (path === "/robots.txt" && request.method === "GET") {
        const robotsTxt = `# OpenCALL Demo Library
# AI agent instructions available at: ${AGENTS_URL}
User-agent: *
Allow: /
`;
        return addStandardHeaders(
          new Response(robotsTxt, {
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          })
        );
      }

      // ── Auth routes (always accessible) ───────────────────────────

      if (path === "/auth" && request.method === "GET") {
        return addStandardHeaders(handleAuthPage(request));
      }

      if (path === "/auth" && request.method === "POST") {
        const response = await handleAuthSubmit(request);
        return addStandardHeaders(response);
      }

      if (path === "/logout" && request.method === "GET") {
        return addStandardHeaders(handleLogout(request));
      }

      // ── Admin routes ──────────────────────────────────────────────

      if (path === "/api/reset" && request.method === "POST") {
        // Clear all app sessions when the API is reset
        clearAllSessions();
        return jsonResponse({ message: "App sessions cleared" });
      }

      // ── Authenticated page routes ─────────────────────────────────

      if (path === "/" && request.method === "GET") {
        const auth = requireSession(request);
        if ("redirect" in auth) return auth.redirect;
        trackPageView(auth.session);
        return htmlResponse(renderDashboard(auth.session));
      }

      if (path === "/catalog" && request.method === "GET") {
        const auth = requireSession(request);
        if ("redirect" in auth) return auth.redirect;
        trackPageView(auth.session);
        return htmlResponse(renderCatalog(auth.session));
      }

      // Handle /catalog/:id routes
      if (path.startsWith("/catalog/") && request.method === "GET") {
        const auth = requireSession(request);
        if ("redirect" in auth) return auth.redirect;
        const itemId = path.slice("/catalog/".length);
        if (itemId) {
          trackPageView(auth.session);
          return htmlResponse(renderItem(auth.session, itemId));
        }
      }

      if (path === "/account" && request.method === "GET") {
        const auth = requireSession(request);
        if ("redirect" in auth) return auth.redirect;
        trackPageView(auth.session);
        return htmlResponse(renderAccount(auth.session));
      }

      if (path === "/reports" && request.method === "GET") {
        const auth = requireSession(request);
        if ("redirect" in auth) return auth.redirect;
        trackPageView(auth.session);
        return htmlResponse(renderReports(auth.session));
      }

      // ── 404 ───────────────────────────────────────────────────────

      return addStandardHeaders(
        new Response(
          `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>404 - Not Found</title>
  <link rel="stylesheet" href="/app.css">
</head>
<body class="auth-page">
  <main class="auth-container">
    <div class="auth-card">
      <h1>404 - Not Found</h1>
      <p>The page you are looking for does not exist.</p>
      <a href="/" class="btn btn-primary">Go to Dashboard</a>
    </div>
  </main>
</body>
</html>`,
          {
            status: 404,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          }
        )
      );
    },
  });

  console.log(`App server listening on port ${port}`);
  return server;
}

// Auto-start if this is the main module
if (import.meta.main) {
  startServer();
}
