import { getDb, closeDb } from "./db/connection.ts";
import { buildRegistry, handleRegistryRequest, getOperationModules } from "./ops/registry.ts";
import { dispatch, registerOperations } from "./call/dispatcher.ts";
import { handleHumanAuth, handleAgentAuth } from "./auth/handlers.ts";
import { handlePolling } from "./ops/polling.ts";
import { handleChunks } from "./ops/chunks.ts";
import { incrementApiCalls, incrementPageViews } from "./services/analytics.ts";

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
        return new Response(JSON.stringify(result.body), {
          status: result.status,
          headers,
        });
      }

      // Route: GET /call -> 405
      if (path === "/call" && request.method === "GET") {
        return new Response(
          JSON.stringify({
            requestId: crypto.randomUUID(),
            state: "error",
            error: { code: "METHOD_NOT_ALLOWED", message: "Use POST /call to invoke operations" },
          }),
          { status: 405, headers: { "Content-Type": "application/json", "Allow": "POST" } }
        );
      }

      // Route: GET /.well-known/ops
      if (path === "/.well-known/ops" && request.method === "GET") {
        return handleRegistryRequest(request);
      }

      // Route: POST /auth
      if (path === "/auth" && request.method === "POST") {
        return handleHumanAuth(request, db);
      }

      // Route: POST /auth/agent
      if (path === "/auth/agent" && request.method === "POST") {
        return handleAgentAuth(request, db);
      }

      // Route: GET /ops/:requestId/chunks (chunked retrieval)
      if (path.includes("/chunks") && request.method === "GET") {
        const requestId = path.split("/ops/")[1]?.split("/chunks")[0];
        if (!requestId) {
          return new Response(
            JSON.stringify({ error: "Invalid request" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const cursor = url.searchParams.get("cursor");
        return handleChunks(requestId, cursor);
      }

      // Route: GET /ops/:requestId (polling for async operation status)
      if (path.startsWith("/ops/") && request.method === "GET") {
        const requestId = path.split("/ops/")[1];
        if (!requestId) {
          return new Response(
            JSON.stringify({ error: "Invalid request" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        return handlePolling(requestId);
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
        return new Response(null, { status: 204 });
      }

      // Route: POST /admin/reset
      if (path === "/admin/reset" && request.method === "POST") {
        const adminSecret = process.env.ADMIN_SECRET;
        const authHeader = request.headers.get("Authorization");
        if (!adminSecret || authHeader !== `Bearer ${adminSecret}`) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
        }
        // Import and run reset
        const { resetDatabase } = await import("./db/reset.ts");
        resetDatabase(db);
        return new Response(JSON.stringify({ message: "Database reset complete" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      // 404 for everything else
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    },
  });

  console.log(`API server listening on port ${port}`);
  return server;
}

// Auto-start if this is the main module
if (import.meta.main) {
  startServer();
}
