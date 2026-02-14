/**
 * WWW brochure site server
 * Serves the static brochure site with templated URLs
 */

const PORT = parseInt(process.env.WWW_PORT || process.env.PORT || "8080", 10);
const APP_URL = process.env.APP_URL || "http://localhost:8000";
const API_URL = process.env.API_URL || "http://localhost:3000";

// Read and template the HTML file
const indexHtmlPath = new URL("../index.html", import.meta.url).pathname;
const indexHtmlRaw = await Bun.file(indexHtmlPath).text();

function getTemplatedHtml(): string {
  return indexHtmlRaw
    .replace(/\{\{APP_URL\}\}/g, APP_URL)
    .replace(/\{\{API_URL\}\}/g, API_URL);
}

const server = Bun.serve({
  port: PORT,
  fetch(request: Request): Response {
    const url = new URL(request.url);
    const path = url.pathname;

    // Serve templated index.html at root or /index.html
    if (path === "/" || path === "/index.html") {
      const content = getTemplatedHtml();
      return new Response(content, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "public, max-age=300",
        },
      });
    }

    // Serve style.css
    if (path === "/style.css") {
      const cssPath = new URL("../style.css", import.meta.url).pathname;
      return new Response(Bun.file(cssPath), {
        headers: {
          "Content-Type": "text/css; charset=utf-8",
          "Cache-Control": "public, max-age=300",
        },
      });
    }

    // Serve static files from /assets/
    if (path.startsWith("/assets/")) {
      const assetPath = new URL(".." + path, import.meta.url).pathname;
      const file = Bun.file(assetPath);
      return new Response(file);
    }

    // Health check
    if (path === "/health") {
      return new Response(JSON.stringify({ status: "ok", service: "www" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 404 for everything else
    return new Response("Not found", { status: 404 });
  },
});

console.log(`WWW server listening on port ${PORT}`);
console.log(`  APP_URL: ${APP_URL}`);
console.log(`  API_URL: ${API_URL}`);

export { server };
