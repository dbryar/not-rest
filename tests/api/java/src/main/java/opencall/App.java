package opencall;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.javalin.Javalin;
import io.javalin.http.Context;
import io.javalin.json.JavalinJackson;
import io.javalin.websocket.WsContext;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Main Javalin server for the OpenCALL Todo API.
 */
public class App {

    private static final ObjectMapper mapper = new ObjectMapper();

    public static Javalin createServer(int port) {
        // Reset all stores
        Operations.resetStorage();
        Auth.resetTokenStore();
        State.resetInstances();
        Media.resetMedia();
        Operations.resetStreamSessions();

        // Build registry
        Map<String, Object> registry = Registry.buildRegistry();
        String registryJson;
        try {
            registryJson = mapper.writeValueAsString(registry);
        } catch (Exception e) {
            throw new RuntimeException("Failed to serialize registry", e);
        }
        String registryEtag = "\"" + sha256Hex(registryJson.getBytes(StandardCharsets.UTF_8)) + "\"";

        // Track active WebSocket connections by their Javalin session ID
        Map<String, WsContext> activeWebSockets = new ConcurrentHashMap<>();

        // Set up broadcast function
        Operations.setBroadcastFn((event, data) -> {
            try {
                String message = mapper.writeValueAsString(data);
                for (WsContext ws : activeWebSockets.values()) {
                    try {
                        ws.send(message);
                    } catch (Exception e) {
                        // Connection may be closed
                    }
                }
            } catch (Exception e) {
                // Serialization error
            }
            return null;
        });

        Javalin app = Javalin.create(config -> {
            config.jsonMapper(new JavalinJackson(mapper, false));
        });

        // GET /.well-known/ops -- registry
        app.get("/.well-known/ops", ctx -> {
            String ifNoneMatch = ctx.header("If-None-Match");
            if (registryEtag.equals(ifNoneMatch)) {
                ctx.status(304);
                return;
            }
            ctx.status(200)
                .contentType("application/json")
                .header("Cache-Control", "public, max-age=3600")
                .header("ETag", registryEtag)
                .result(registryJson);
        });

        // GET /call -- method not allowed, point to POST /call and registry
        app.get("/call", ctx -> {
            LinkedHashMap<String, Object> error = new LinkedHashMap<>();
            error.put("code", "METHOD_NOT_ALLOWED");
            error.put("message", "Use POST /call to invoke operations. Discover available operations at GET /.well-known/ops");
            LinkedHashMap<String, Object> body = new LinkedHashMap<>();
            body.put("requestId", UUID.randomUUID().toString());
            body.put("state", "error");
            body.put("error", error);
            ctx.status(405)
                .header("Allow", "POST")
                .json(body);
        });

        // POST /call -- operation invocation
        app.post("/call", ctx -> {
            String contentType = ctx.contentType() != null ? ctx.contentType() : "";
            Map<String, Object> envelope;
            Operations.MediaFile mediaFile = null;

            if (contentType.contains("multipart/form-data")) {
                try {
                    String envelopePart = ctx.formParam("envelope");
                    if (envelopePart == null) {
                        sendError(ctx, 400, "INVALID_REQUEST", "Missing envelope part in multipart request");
                        return;
                    }
                    envelope = parseJson(envelopePart);

                    var uploadedFile = ctx.uploadedFile("file");
                    if (uploadedFile != null) {
                        byte[] data = uploadedFile.content().readAllBytes();
                        String fileContentType = uploadedFile.contentType() != null
                            ? uploadedFile.contentType() : "application/octet-stream";
                        String fn = uploadedFile.filename() != null
                            ? uploadedFile.filename() : "upload";
                        mediaFile = new Operations.MediaFile(data, fileContentType, fn);
                    }
                } catch (Exception e) {
                    sendError(ctx, 400, "INVALID_REQUEST", "Invalid multipart request");
                    return;
                }
            } else {
                try {
                    String body = ctx.body();
                    envelope = parseJson(body);
                } catch (Exception e) {
                    sendError(ctx, 400, "INVALID_REQUEST", "Invalid JSON in request body");
                    return;
                }
            }

            String authHeader = ctx.header("Authorization");
            Map<String, Object> response = Router.handleCall(envelope, authHeader, mediaFile);

            int status = (int) response.get("status");
            Object body = response.get("body");
            ctx.status(status).json(body);
        });

        // GET /media/{id}/data -- actual binary data (defined before /media/{id} for routing)
        app.get("/media/{id}/data", ctx -> {
            String mediaId = ctx.pathParam("id");
            Media.StoredMedia media = Media.getMedia(mediaId);
            if (media == null) {
                sendError(ctx, 404, "NOT_FOUND", "Media not found");
                return;
            }
            ctx.status(200)
                .contentType(media.contentType())
                .header("Content-Disposition", "attachment; filename=\"" + media.filename() + "\"")
                .result(new ByteArrayInputStream(media.data()));
        });

        // GET /media/{id} -- media egress with 303 redirect
        app.get("/media/{id}", ctx -> {
            String mediaId = ctx.pathParam("id");
            Media.StoredMedia media = Media.getMedia(mediaId);
            if (media == null) {
                sendError(ctx, 404, "NOT_FOUND", "Media not found");
                return;
            }
            ctx.status(303).header("Location", "/media/" + mediaId + "/data");
        });

        // GET /ops/{requestId}/chunks -- chunked retrieval (must come before /ops/{requestId})
        app.get("/ops/{requestId}/chunks", ctx -> {
            String requestId = ctx.pathParam("requestId");
            State.OperationInstance instance = State.getInstance(requestId);

            if (instance == null) {
                LinkedHashMap<String, Object> body = new LinkedHashMap<>();
                body.put("requestId", requestId);
                body.put("state", "error");
                LinkedHashMap<String, Object> error = new LinkedHashMap<>();
                error.put("code", "NOT_FOUND");
                error.put("message", "Operation " + requestId + " not found");
                body.put("error", error);
                ctx.status(404).json(body);
                return;
            }

            if (!"complete".equals(instance.state) || instance.chunks == null || instance.chunks.isEmpty()) {
                LinkedHashMap<String, Object> body = new LinkedHashMap<>();
                body.put("requestId", requestId);
                body.put("state", "error");
                LinkedHashMap<String, Object> error = new LinkedHashMap<>();
                error.put("code", "NOT_READY");
                error.put("message", "Operation not yet complete or has no chunks");
                body.put("error", error);
                ctx.status(400).json(body);
                return;
            }

            String cursorParam = ctx.queryParam("cursor");
            int chunkIndex = 0;
            if (cursorParam != null) {
                try {
                    int offset = Integer.parseInt(
                        new String(Base64.getDecoder().decode(cursorParam)));
                    chunkIndex = -1;
                    for (int i = 0; i < instance.chunks.size(); i++) {
                        if (instance.chunks.get(i).offset == offset) {
                            chunkIndex = i;
                            break;
                        }
                    }
                    if (chunkIndex == -1) chunkIndex = 0;
                } catch (Exception e) {
                    chunkIndex = 0;
                }
            }

            State.Chunk chunk = instance.chunks.get(chunkIndex);
            LinkedHashMap<String, Object> body = new LinkedHashMap<>();
            body.put("requestId", requestId);
            body.put("chunk", chunk.toMap());
            ctx.status(200).json(body);
        });

        // GET /ops/{requestId} -- poll async operation state
        app.get("/ops/{requestId}", ctx -> {
            String requestId = ctx.pathParam("requestId");
            State.OperationInstance instance = State.getInstance(requestId);

            if (instance == null) {
                LinkedHashMap<String, Object> body = new LinkedHashMap<>();
                body.put("requestId", requestId);
                body.put("state", "error");
                LinkedHashMap<String, Object> error = new LinkedHashMap<>();
                error.put("code", "NOT_FOUND");
                error.put("message", "Operation " + requestId + " not found");
                body.put("error", error);
                ctx.status(404).json(body);
                return;
            }

            LinkedHashMap<String, Object> body = new LinkedHashMap<>();
            body.put("requestId", instance.requestId);
            body.put("state", instance.state);

            if ("complete".equals(instance.state) && instance.result != null) {
                body.put("result", instance.result);
            }
            if ("error".equals(instance.state) && instance.error != null) {
                body.put("error", instance.error);
            }
            if ("accepted".equals(instance.state) || "pending".equals(instance.state)) {
                body.put("retryAfterMs", instance.retryAfterMs);
            }
            body.put("expiresAt", instance.expiresAt);

            ctx.status(200).json(body);
        });

        // WS /streams/{sessionId} -- WebSocket stream
        app.ws("/streams/{sessionId}", ws -> {
            ws.onConnect(wsCtx -> {
                String sid = wsCtx.pathParam("sessionId");
                Operations.StreamSession session = Operations.getStreamSession(sid);
                if (session == null) {
                    wsCtx.closeSession(4004, "Stream session not found");
                    return;
                }
                activeWebSockets.put(sid, wsCtx);
            });
            ws.onClose(wsCtx -> {
                String sid = wsCtx.pathParam("sessionId");
                activeWebSockets.remove(sid);
            });
            ws.onMessage(wsCtx -> {
                // No inbound messages expected for watch streams
            });
        });

        // POST /_internal/tokens -- register auth tokens (test helper)
        app.post("/_internal/tokens", ctx -> {
            Map<String, Object> body = parseJson(ctx.body());
            String token = (String) body.get("token");
            @SuppressWarnings("unchecked")
            List<String> scopes = (List<String>) body.get("scopes");
            Auth.registerToken(token, scopes);
            ctx.status(200).json(Map.of("ok", true));
        });

        app.start(port);
        return app;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> parseJson(String json) throws Exception {
        return mapper.readValue(json, LinkedHashMap.class);
    }

    private static void sendError(Context ctx, int status, String code, String message) {
        LinkedHashMap<String, Object> body = new LinkedHashMap<>();
        body.put("requestId", UUID.randomUUID().toString());
        body.put("state", "error");
        LinkedHashMap<String, Object> error = new LinkedHashMap<>();
        error.put("code", code);
        error.put("message", message);
        body.put("error", error);
        ctx.status(status).json(body);
    }

    private static String sha256Hex(byte[] data) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(data);
            StringBuilder hex = new StringBuilder();
            for (byte b : hash) {
                hex.append(String.format("%02x", b));
            }
            return hex.toString();
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    public static void main(String[] args) {
        int port = 3000;
        String portEnv = System.getenv("PORT");
        if (portEnv != null) {
            try {
                port = Integer.parseInt(portEnv);
            } catch (NumberFormatException e) {
                // Use default
            }
        }
        Javalin server = createServer(port);
        System.out.println("OpenCALL Todo API listening on http://localhost:" + port);
    }
}
