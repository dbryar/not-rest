import { getDb, closeDb } from "./db/connection.ts";
import { buildRegistry, handleRegistryRequest, getOperationModules } from "./ops/registry.ts";
import { dispatch, registerOperations } from "./call/dispatcher.ts";
import { handleHumanAuth, handleAgentAuth } from "./auth/handlers.ts";
import { handlePolling } from "./ops/polling.ts";
import { handleChunks } from "./ops/chunks.ts";
import { incrementApiCalls, incrementPageViews } from "./services/analytics.ts";

// CORS configuration
const ALLOWED_ORIGINS = [
  process.env.APP_URL || "http://localhost:8000",
];

/**
 * Build CORS headers for a given request origin.
 * Returns empty Access-Control-Allow-Origin if origin is not allowed.
 */
function corsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
  };
}

/**
 * Add CORS headers to a response.
 */
function withCors(response: Response, origin: string | null): Response {
  const headers = corsHeaders(origin);
  for (const [key, value] of Object.entries(headers)) {
    if (value) response.headers.set(key, value);
  }
  return response;
}

export async function startServer() {
  const db = getDb();

  // Build registry at boot time (scans operation modules)
  await buildRegistry();

  // Register operation modules with the dispatcher
  const modules = getOperationModules();
  // Convert to the right type for registerOperations
  registerOperations(modules as any);

  const port = parseInt(process.env.PORT || "8080", 10);

  const server = Bun.serve({
    port,
    async fetch(request) {
      const url = new URL(request.url);
      const path = url.pathname;
      const origin = request.headers.get("Origin");

      // Handle OPTIONS preflight for CORS
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: corsHeaders(origin),
        });
      }

      // Route: POST /call
      if (path === "/call" && request.method === "POST") {
        const result = await dispatch(request, db);
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        // Add Location header for 303 redirects
        if (result.status === 303 && result.body.location?.uri) {
          headers["Location"] = result.body.location.uri;
        }
        // Fire-and-forget: increment API call analytics
        if (result.ctx?.analyticsId && result.ctx.tokenType) {
          incrementApiCalls(result.ctx.analyticsId, result.ctx.tokenType);
        }
        return withCors(new Response(JSON.stringify(result.body), {
          status: result.status,
          headers,
        }), origin);
      }

      // Route: GET /call -> 405
      if (path === "/call" && request.method === "GET") {
        return withCors(new Response(
          JSON.stringify({
            requestId: crypto.randomUUID(),
            state: "error",
            error: { code: "METHOD_NOT_ALLOWED", message: "Use POST /call to invoke operations" },
          }),
          { status: 405, headers: { "Content-Type": "application/json", "Allow": "POST" } }
        ), origin);
      }

      // Route: GET /.well-known/ops
      if (path === "/.well-known/ops" && request.method === "GET") {
        return withCors(await handleRegistryRequest(request), origin);
      }

      // Route: POST /auth
      if (path === "/auth" && request.method === "POST") {
        return withCors(await handleHumanAuth(request, db), origin);
      }

      // Route: POST /auth/agent
      if (path === "/auth/agent" && request.method === "POST") {
        return withCors(await handleAgentAuth(request, db), origin);
      }

      // Route: GET /ops/:requestId/chunks (chunked retrieval)
      if (path.includes("/chunks") && request.method === "GET") {
        const requestId = path.split("/ops/")[1]?.split("/chunks")[0];
        if (!requestId) {
          return withCors(new Response(
            JSON.stringify({ error: "Invalid request" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          ), origin);
        }
        const cursor = url.searchParams.get("cursor");
        return withCors(await handleChunks(requestId, cursor), origin);
      }

      // Route: GET /ops/:requestId (polling for async operation status)
      if (path.startsWith("/ops/") && request.method === "GET") {
        const requestId = path.split("/ops/")[1];
        if (!requestId) {
          return withCors(new Response(
            JSON.stringify({ error: "Invalid request" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          ), origin);
        }
        return withCors(await handlePolling(requestId), origin);
      }

      // Route: POST /admin/pageview (fire-and-forget analytics from app server)
      if (path === "/admin/pageview" && request.method === "POST") {
        try {
          const body = await request.json() as { visitorId?: string };
          if (body.visitorId) {
            incrementPageViews(body.visitorId);
          }
        } catch {
          // Fire-and-forget — ignore errors
        }
        return withCors(new Response(null, { status: 204 }), origin);
      }

      // Route: POST /admin/reset
      if (path === "/admin/reset" && request.method === "POST") {
        const adminSecret = process.env.ADMIN_SECRET;
        const authHeader = request.headers.get("Authorization");
        if (!adminSecret || authHeader !== `Bearer ${adminSecret}`) {
          return withCors(new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }), origin);
        }
        // Import and run reset
        const { resetDatabase } = await import("./db/reset.ts");
        resetDatabase(db);
        return withCors(new Response(JSON.stringify({ message: "Database reset complete" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }), origin);
      }

      // 404 for everything else
      return withCors(new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }), origin);
    },
  });

  console.log(`API server listening on port ${port}`);
  return server;
}

// Auto-start if this is the main module
if (import.meta.main) {
  startServer();
}
