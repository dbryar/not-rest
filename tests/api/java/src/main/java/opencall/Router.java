package opencall;

import java.time.Instant;
import java.time.LocalDate;
import java.util.*;

/**
 * Envelope dispatcher for the OpenCALL Todo API.
 */
public final class Router {

    @SuppressWarnings("unchecked")
    public static Map<String, Object> handleCall(
        Map<String, Object> envelope,
        String authHeader,
        Operations.MediaFile mediaFile
    ) {
        Map<String, Object> ctx = envelope.get("ctx") instanceof Map
            ? (Map<String, Object>) envelope.get("ctx")
            : new LinkedHashMap<>();

        String requestId = ctx.get("requestId") instanceof String
            ? (String) ctx.get("requestId")
            : UUID.randomUUID().toString();

        String sessionId = ctx.get("sessionId") instanceof String
            ? (String) ctx.get("sessionId")
            : null;

        LinkedHashMap<String, Object> base = new LinkedHashMap<>();
        base.put("requestId", requestId);
        if (sessionId != null) {
            base.put("sessionId", sessionId);
        }

        // Validate op is present and a string
        Object opObj = envelope.get("op");
        if (opObj == null || !(opObj instanceof String) || ((String) opObj).isEmpty()) {
            LinkedHashMap<String, Object> body = new LinkedHashMap<>(base);
            body.put("state", "error");
            LinkedHashMap<String, Object> error = new LinkedHashMap<>();
            error.put("code", "INVALID_REQUEST");
            error.put("message", "Missing or invalid 'op' field");
            body.put("error", error);

            LinkedHashMap<String, Object> result = new LinkedHashMap<>();
            result.put("status", 400);
            result.put("body", body);
            return result;
        }

        String op = (String) opObj;

        // Look up operation
        Operations.OperationEntry operation = Operations.OPERATIONS.get(op);
        if (operation == null) {
            LinkedHashMap<String, Object> body = new LinkedHashMap<>(base);
            body.put("state", "error");
            LinkedHashMap<String, Object> error = new LinkedHashMap<>();
            error.put("code", "UNKNOWN_OP");
            error.put("message", "Unknown operation: " + op);
            body.put("error", error);

            LinkedHashMap<String, Object> result = new LinkedHashMap<>();
            result.put("status", 400);
            result.put("body", body);
            return result;
        }

        // Deprecated check -- past sunset date means 410
        if (operation.deprecated && operation.sunset != null) {
            LocalDate sunsetDate = LocalDate.parse(operation.sunset);
            if (LocalDate.now().isAfter(sunsetDate)) {
                LinkedHashMap<String, Object> body = new LinkedHashMap<>(base);
                body.put("state", "error");
                LinkedHashMap<String, Object> error = new LinkedHashMap<>();
                error.put("code", "OP_REMOVED");
                error.put("message", "Operation " + op + " has been removed");
                LinkedHashMap<String, Object> cause = new LinkedHashMap<>();
                cause.put("removedOp", op);
                cause.put("replacement", operation.replacement);
                error.put("cause", cause);
                body.put("error", error);

                LinkedHashMap<String, Object> result = new LinkedHashMap<>();
                result.put("status", 410);
                result.put("body", body);
                return result;
            }
        }

        // Auth check
        if (operation.authScopes != null && !operation.authScopes.isEmpty()) {
            Auth.AuthResult authResult = Auth.validateAuth(authHeader, operation.authScopes);
            if (!authResult.valid()) {
                LinkedHashMap<String, Object> body = new LinkedHashMap<>(base);
                body.put("state", "error");
                LinkedHashMap<String, Object> error = new LinkedHashMap<>();
                error.put("code", authResult.code());
                error.put("message", authResult.message());
                body.put("error", error);

                LinkedHashMap<String, Object> result = new LinkedHashMap<>();
                result.put("status", authResult.status());
                result.put("body", body);
                return result;
            }
        }

        // Check idempotency store for side-effecting ops
        String idempotencyKey = ctx.get("idempotencyKey") instanceof String
            ? (String) ctx.get("idempotencyKey")
            : null;

        if (operation.sideEffecting && idempotencyKey != null) {
            Object cached = Operations.getIdempotencyStore().get(idempotencyKey);
            if (cached != null) {
                return (Map<String, Object>) cached;
            }
        }

        // Execute handler
        Object rawArgs = envelope.get("args");
        if (rawArgs == null) rawArgs = new LinkedHashMap<>();

        try {
            // Stream operations
            if ("stream".equals(operation.executionModel) && operation.streamHandler != null) {
                Map<String, Object> streamResult = operation.streamHandler.apply(rawArgs);
                if (!Boolean.TRUE.equals(streamResult.get("ok"))) {
                    LinkedHashMap<String, Object> body = new LinkedHashMap<>(base);
                    body.put("state", "error");
                    body.put("error", streamResult.get("error"));

                    LinkedHashMap<String, Object> result = new LinkedHashMap<>();
                    result.put("status", 200);
                    result.put("body", body);
                    return result;
                }

                String streamSessionId = (String) streamResult.get("sessionId");
                LinkedHashMap<String, Object> body = new LinkedHashMap<>(base);
                body.put("state", "streaming");
                LinkedHashMap<String, Object> stream = new LinkedHashMap<>();
                stream.put("transport", "wss");
                stream.put("location", "/streams/" + streamSessionId);
                stream.put("sessionId", streamSessionId);
                stream.put("encoding", "json");
                stream.put("expiresAt", Instant.now().plusSeconds(3600).getEpochSecond());
                body.put("stream", stream);

                LinkedHashMap<String, Object> result = new LinkedHashMap<>();
                result.put("status", 202);
                result.put("body", body);
                return result;
            }

            // Async operations
            if ("async".equals(operation.executionModel) && operation.asyncHandler != null) {
                Map<String, Object> asyncResult = operation.asyncHandler.apply(rawArgs, requestId);
                if (!Boolean.TRUE.equals(asyncResult.get("ok"))) {
                    LinkedHashMap<String, Object> body = new LinkedHashMap<>(base);
                    body.put("state", "error");
                    body.put("error", asyncResult.get("error"));

                    LinkedHashMap<String, Object> result = new LinkedHashMap<>();
                    result.put("status", 200);
                    result.put("body", body);
                    return result;
                }

                LinkedHashMap<String, Object> body = new LinkedHashMap<>(base);
                body.put("state", "accepted");
                body.put("retryAfterMs", 100);
                body.put("expiresAt", Instant.now().plusSeconds(3600).getEpochSecond());

                LinkedHashMap<String, Object> result = new LinkedHashMap<>();
                result.put("status", 202);
                result.put("body", body);
                return result;
            }

            // Sync operations (including media handler)
            Map<String, Object> handlerResult;
            if (operation.acceptsMedia) {
                handlerResult = Operations.callAttachHandler(rawArgs, mediaFile);
            } else {
                handlerResult = operation.handler.apply(rawArgs);
            }

            LinkedHashMap<String, Object> response;
            if (Boolean.TRUE.equals(handlerResult.get("ok"))) {
                LinkedHashMap<String, Object> body = new LinkedHashMap<>(base);
                body.put("state", "complete");
                body.put("result", handlerResult.get("result"));

                response = new LinkedHashMap<>();
                response.put("status", 200);
                response.put("body", body);
            } else {
                // Domain error -- HTTP 200
                LinkedHashMap<String, Object> body = new LinkedHashMap<>(base);
                body.put("state", "error");
                body.put("error", handlerResult.get("error"));

                response = new LinkedHashMap<>();
                response.put("status", 200);
                response.put("body", body);
            }

            // Store for idempotency
            if (operation.sideEffecting && idempotencyKey != null) {
                Operations.getIdempotencyStore().put(idempotencyKey, response);
            }

            return response;

        } catch (Operations.ValidationError err) {
            LinkedHashMap<String, Object> body = new LinkedHashMap<>(base);
            body.put("state", "error");
            LinkedHashMap<String, Object> error = new LinkedHashMap<>();
            error.put("code", "VALIDATION_ERROR");
            error.put("message", err.getMessage());
            body.put("error", error);

            LinkedHashMap<String, Object> result = new LinkedHashMap<>();
            result.put("status", 400);
            result.put("body", body);
            return result;

        } catch (Operations.ServerError err) {
            LinkedHashMap<String, Object> body = new LinkedHashMap<>(base);
            body.put("state", "error");
            LinkedHashMap<String, Object> error = new LinkedHashMap<>();
            error.put("code", err.code);
            error.put("message", err.getMessage());
            body.put("error", error);

            LinkedHashMap<String, Object> result = new LinkedHashMap<>();
            result.put("status", err.statusCode);
            result.put("body", body);
            return result;

        } catch (Exception err) {
            LinkedHashMap<String, Object> body = new LinkedHashMap<>(base);
            body.put("state", "error");
            LinkedHashMap<String, Object> error = new LinkedHashMap<>();
            error.put("code", "INTERNAL_ERROR");
            error.put("message", err.getMessage() != null ? err.getMessage() : "Unknown error");
            body.put("error", error);

            LinkedHashMap<String, Object> result = new LinkedHashMap<>();
            result.put("status", 500);
            result.put("body", body);
            return result;
        }
    }
}
