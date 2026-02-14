/**
 * Agents service server
 * Serves agent instructions markdown with templated URLs
 */

const PORT = parseInt(process.env.AGENTS_PORT || process.env.PORT || "8888", 10);
const API_URL = process.env.API_URL || "http://localhost:3000";

// Read and template the markdown file
const indexMdPath = new URL("../index.md", import.meta.url).pathname;
const indexMdRaw = await Bun.file(indexMdPath).text();

function getTemplatedMarkdown(): string {
  return indexMdRaw.replace(/\{\{API_URL\}\}/g, API_URL);
}

const server = Bun.serve({
  port: PORT,
  fetch(request: Request): Response {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers for API access
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // Handle OPTIONS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Serve agent instructions at root or /index.md
    if (path === "/" || path === "/index.md") {
      const content = getTemplatedMarkdown();
      return new Response(content, {
        status: 200,
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Cache-Control": "public, max-age=300",
          ...corsHeaders,
        },
      });
    }

    // Health check
    if (path === "/health") {
      return new Response(JSON.stringify({ status: "ok", service: "agents" }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // 404 for everything else
    return new Response("Not found", { status: 404, headers: corsHeaders });
  },
});

console.log(`Agents server listening on port ${PORT}`);
console.log(`  API_URL: ${API_URL}`);

export { server };
