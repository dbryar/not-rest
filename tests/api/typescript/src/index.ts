import { buildRegistry } from "./registry";
import { handleCall } from "./router";
import { resetStorage, type MediaFile, getStreamSession, setBroadcastFn, resetStreamSessions } from "./operations";
import { registerToken, resetTokenStore } from "./auth";
import { getInstance, resetInstances } from "./state";
import { getMedia, resetMedia } from "./media";
import type { ServerWebSocket } from "bun";

export function createServer(port: number = 3000) {
  resetStorage();
  resetTokenStore();
  resetInstances();
  resetMedia();
  resetStreamSessions();

  const registry = buildRegistry();
  const registryJson = JSON.stringify(registry);
  const registryEtag = `"${Bun.hash(registryJson).toString(16)}"`;

  // Track active WebSocket connections
  const activeWebSockets = new Set<ServerWebSocket<{ sessionId: string }>>();

  // Set up broadcast function
  setBroadcastFn((_event: string, data: Record<string, unknown>) => {
    const message = JSON.stringify(data);
    for (const ws of activeWebSockets) {
      try {
        ws.send(message);
      } catch {
        // Connection may be closed
      }
    }
  });

  return Bun.serve<{ sessionId: string }>({
    port,
    fetch(req, server) {
      const url = new URL(req.url);

      // WebSocket upgrade at /streams/{sessionId}
      const streamsMatch = url.pathname.match(/^\/streams\/([^/]+)$/);
      if (streamsMatch) {
        const sessionId = streamsMatch[1];
        const session = getStreamSession(sessionId);
        if (!session) {
          return Response.json(
            {
              requestId: crypto.randomUUID(),
              state: "error",
              error: { code: "NOT_FOUND", message: "Stream session not found" },
            },
            { status: 404 }
          );
        }
        const upgraded = server.upgrade(req, { data: { sessionId } });
        if (!upgraded) {
          return Response.json(
            {
              requestId: crypto.randomUUID(),
              state: "error",
              error: { code: "UPGRADE_FAILED", message: "WebSocket upgrade failed" },
            },
            { status: 400 }
          );
        }
        return undefined;
      }

      // GET /.well-known/ops — registry
      if (req.method === "GET" && url.pathname === "/.well-known/ops") {
        const ifNoneMatch = req.headers.get("if-none-match");
        if (ifNoneMatch === registryEtag) {
          return new Response(null, { status: 304 });
        }
        return new Response(registryJson, {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=3600",
            ETag: registryEtag,
          },
        });
      }

      // GET /call — 405 Method Not Allowed
      if (req.method === "GET" && url.pathname === "/call") {
        return Response.json(
          {
            requestId: crypto.randomUUID(),
            state: "error",
            error: {
              code: "METHOD_NOT_ALLOWED",
              message:
                "Use POST /call to invoke operations. Discover available operations at GET /.well-known/ops",
            },
          },
          { status: 405, headers: { Allow: "POST" } }
        );
      }

      // POST /call — operation invocation
      if (req.method === "POST" && url.pathname === "/call") {
        return (async () => {
          const contentType = req.headers.get("content-type") || "";
          let envelope: unknown;
          let mediaFile: MediaFile | undefined;

          if (contentType.includes("multipart/form-data")) {
            try {
              const formData = await req.formData();
              const envelopePart = formData.get("envelope");
              if (typeof envelopePart === "string") {
                envelope = JSON.parse(envelopePart);
              } else if (envelopePart instanceof Blob) {
                envelope = JSON.parse(await envelopePart.text());
              } else {
                return Response.json(
                  {
                    requestId: crypto.randomUUID(),
                    state: "error",
                    error: { code: "INVALID_REQUEST", message: "Missing envelope part in multipart request" },
                  },
                  { status: 400 }
                );
              }

              const file = formData.get("file");
              if (file instanceof File) {
                const data = new Uint8Array(await file.arrayBuffer());
                mediaFile = {
                  data,
                  contentType: file.type || "application/octet-stream",
                  filename: file.name || "upload",
                };
              }
            } catch {
              return Response.json(
                {
                  requestId: crypto.randomUUID(),
                  state: "error",
                  error: { code: "INVALID_REQUEST", message: "Invalid multipart request" },
                },
                { status: 400 }
              );
            }
          } else {
            try {
              envelope = await req.json();
            } catch {
              return Response.json(
                {
                  requestId: crypto.randomUUID(),
                  state: "error",
                  error: {
                    code: "INVALID_REQUEST",
                    message: "Invalid JSON in request body",
                  },
                },
                { status: 400 }
              );
            }
          }

          const authHeader = req.headers.get("authorization");
          const { status, body } = handleCall(envelope as Parameters<typeof handleCall>[0], authHeader, mediaFile);
          return Response.json(body, { status });
        })();
      }

      // GET /media/{id} — media egress with 303 redirect
      const mediaMatch = url.pathname.match(/^\/media\/([^/]+)$/);
      if (req.method === "GET" && mediaMatch) {
        const mediaId = mediaMatch[1];
        const media = getMedia(mediaId);
        if (!media) {
          return Response.json(
            {
              requestId: crypto.randomUUID(),
              state: "error",
              error: { code: "NOT_FOUND", message: "Media not found" },
            },
            { status: 404 }
          );
        }
        return new Response(null, {
          status: 303,
          headers: {
            Location: `/media/${mediaId}/data`,
          },
        });
      }

      // GET /media/{id}/data — actual binary data
      const mediaDataMatch = url.pathname.match(/^\/media\/([^/]+)\/data$/);
      if (req.method === "GET" && mediaDataMatch) {
        const mediaId = mediaDataMatch[1];
        const media = getMedia(mediaId);
        if (!media) {
          return Response.json(
            {
              requestId: crypto.randomUUID(),
              state: "error",
              error: { code: "NOT_FOUND", message: "Media not found" },
            },
            { status: 404 }
          );
        }
        return new Response(media.data.buffer as ArrayBuffer, {
          status: 200,
          headers: {
            "Content-Type": media.contentType,
            "Content-Disposition": `attachment; filename="${media.filename}"`,
          },
        });
      }

      // GET /ops/{requestId}/chunks — chunked retrieval
      const chunksMatch = url.pathname.match(/^\/ops\/([^/]+)\/chunks$/);
      if (req.method === "GET" && chunksMatch) {
        const requestId = chunksMatch[1];
        const instance = getInstance(requestId);
        if (!instance) {
          return Response.json(
            {
              requestId,
              state: "error",
              error: { code: "NOT_FOUND", message: `Operation ${requestId} not found` },
            },
            { status: 404 }
          );
        }
        if (instance.state !== "complete" || !instance.chunks || instance.chunks.length === 0) {
          return Response.json(
            {
              requestId,
              state: "error",
              error: { code: "NOT_READY", message: "Operation not yet complete or has no chunks" },
            },
            { status: 400 }
          );
        }

        const cursorParam = url.searchParams.get("cursor");
        let chunkIndex = 0;
        if (cursorParam) {
          try {
            const offset = parseInt(atob(cursorParam), 10);
            chunkIndex = instance.chunks.findIndex((c) => c.offset === offset);
            if (chunkIndex === -1) chunkIndex = 0;
          } catch {
            chunkIndex = 0;
          }
        }

        const chunk = instance.chunks[chunkIndex];
        return Response.json({
          requestId,
          chunk: {
            offset: chunk.offset,
            data: chunk.data,
            checksum: chunk.checksum,
            checksumPrevious: chunk.checksumPrevious,
            state: chunk.state,
            cursor: chunk.cursor,
          },
        });
      }

      // GET /ops/{requestId} — poll async operation state
      const opsMatch = url.pathname.match(/^\/ops\/([^/]+)$/);
      if (req.method === "GET" && opsMatch) {
        const requestId = opsMatch[1];
        const instance = getInstance(requestId);
        if (!instance) {
          return Response.json(
            {
              requestId,
              state: "error",
              error: { code: "NOT_FOUND", message: `Operation ${requestId} not found` },
            },
            { status: 404 }
          );
        }
        const body: Record<string, unknown> = {
          requestId: instance.requestId,
          state: instance.state,
        };
        if (instance.state === "complete" && instance.result !== undefined) {
          body.result = instance.result;
        }
        if (instance.state === "error" && instance.error) {
          body.error = instance.error;
        }
        if (instance.state === "accepted" || instance.state === "pending") {
          body.retryAfterMs = instance.retryAfterMs;
        }
        body.expiresAt = instance.expiresAt;
        return Response.json(body, { status: 200 });
      }

      // POST /_internal/tokens — register auth tokens (test helper)
      if (req.method === "POST" && url.pathname === "/_internal/tokens") {
        return (async () => {
          const { token, scopes } = (await req.json()) as { token: string; scopes: string[] };
          registerToken(token, scopes);
          return Response.json({ ok: true }, { status: 200 });
        })();
      }

      // Everything else — 404
      return Response.json(
        {
          requestId: crypto.randomUUID(),
          state: "error",
          error: { code: "NOT_FOUND", message: "Not found" },
        },
        { status: 404 }
      );
    },
    websocket: {
      open(ws) {
        activeWebSockets.add(ws);
      },
      message(_ws, _message) {
        // No inbound messages expected for watch streams
      },
      close(ws) {
        activeWebSockets.delete(ws);
      },
    },
  });
}

// Start server when run directly
if (import.meta.main) {
  const port = parseInt(process.env.PORT || "3000", 10);
  const server = createServer(port);
  console.log(`OpenCALL Todo API listening on http://localhost:${server.port}`);
}
