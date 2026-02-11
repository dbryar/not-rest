package opencall;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.BiFunction;
import java.util.function.Function;
import java.util.stream.Collectors;

import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * All 12 operation handlers for the OpenCALL Todo API.
 */
public final class Operations {

    // -----------------------------------------------------------------------
    // Exceptions
    // -----------------------------------------------------------------------

    public static class ValidationError extends RuntimeException {
        public ValidationError(String message) {
            super(message);
        }
    }

    public static class ServerError extends RuntimeException {
        public final int statusCode;
        public final String code;

        public ServerError(int statusCode, String code, String message) {
            super(message);
            this.statusCode = statusCode;
            this.code = code;
        }
    }

    // -----------------------------------------------------------------------
    // Media file record
    // -----------------------------------------------------------------------

    public record MediaFile(byte[] data, String contentType, String filename) {}

    // -----------------------------------------------------------------------
    // Stream session management
    // -----------------------------------------------------------------------

    public static class StreamSession {
        public final String sessionId;
        public StreamSession(String sessionId) {
            this.sessionId = sessionId;
        }
    }

    private static ConcurrentHashMap<String, StreamSession> streamSessions = new ConcurrentHashMap<>();
    private static volatile BiFunction<String, Map<String, Object>, Void> broadcastFn = null;

    public static StreamSession registerStreamSession(String sessionId) {
        StreamSession session = new StreamSession(sessionId);
        streamSessions.put(sessionId, session);
        return session;
    }

    public static StreamSession getStreamSession(String sessionId) {
        return streamSessions.get(sessionId);
    }

    public static void setBroadcastFn(BiFunction<String, Map<String, Object>, Void> fn) {
        broadcastFn = fn;
    }

    private static void broadcast(String event, Map<String, Object> data) {
        BiFunction<String, Map<String, Object>, Void> fn = broadcastFn;
        if (fn != null) {
            fn.apply(event, data);
        }
    }

    public static void resetStreamSessions() {
        streamSessions = new ConcurrentHashMap<>();
        broadcastFn = null;
    }

    // -----------------------------------------------------------------------
    // In-memory storage
    // -----------------------------------------------------------------------

    private static ConcurrentHashMap<String, LinkedHashMap<String, Object>> todos = new ConcurrentHashMap<>();
    private static ConcurrentHashMap<String, Object> idempotencyStore = new ConcurrentHashMap<>();

    public static ConcurrentHashMap<String, LinkedHashMap<String, Object>> getTodosStore() {
        return todos;
    }

    public static ConcurrentHashMap<String, Object> getIdempotencyStore() {
        return idempotencyStore;
    }

    public static void resetStorage() {
        todos = new ConcurrentHashMap<>();
        idempotencyStore = new ConcurrentHashMap<>();
    }

    // -----------------------------------------------------------------------
    // Validation helpers
    // -----------------------------------------------------------------------

    private static String nowIso() {
        return Instant.now().toString();
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> asArgs(Object args) {
        if (args == null) return new LinkedHashMap<>();
        if (args instanceof Map) return (Map<String, Object>) args;
        return new LinkedHashMap<>();
    }

    private static String validateString(Map<String, Object> args, String field, boolean required) {
        Object val = args.get(field);
        if (val == null) {
            if (required) throw new ValidationError(field + ": Required");
            return null;
        }
        if (!(val instanceof String)) {
            throw new ValidationError(field + ": Expected string, received " + typeName(val));
        }
        return (String) val;
    }

    private static Integer validateInt(Map<String, Object> args, String field, boolean required,
                                       Integer minimum, Integer maximum, Integer defaultVal) {
        Object val = args.get(field);
        if (val == null) {
            if (required) throw new ValidationError(field + ": Required");
            return defaultVal;
        }
        // Jackson deserializes booleans as Boolean — reject them
        if (val instanceof Boolean) {
            throw new ValidationError(field + ": Expected number, received boolean");
        }
        if (!(val instanceof Number)) {
            throw new ValidationError(field + ": Expected number, received " + typeName(val));
        }
        int intVal = ((Number) val).intValue();
        if (minimum != null && intVal < minimum) {
            throw new ValidationError(field + ": Number must be greater than or equal to " + minimum);
        }
        if (maximum != null && intVal > maximum) {
            throw new ValidationError(field + ": Number must be less than or equal to " + maximum);
        }
        return intVal;
    }

    private static Boolean validateBool(Map<String, Object> args, String field, boolean required) {
        Object val = args.get(field);
        if (val == null) {
            if (required) throw new ValidationError(field + ": Required");
            return null;
        }
        if (!(val instanceof Boolean)) {
            throw new ValidationError(field + ": Expected boolean, received " + typeName(val));
        }
        return (Boolean) val;
    }

    @SuppressWarnings("unchecked")
    private static List<String> validateStringArray(Map<String, Object> args, String field, boolean required) {
        Object val = args.get(field);
        if (val == null) {
            if (required) throw new ValidationError(field + ": Required");
            return null;
        }
        if (!(val instanceof List)) {
            throw new ValidationError(field + ": Expected array, received " + typeName(val));
        }
        List<?> list = (List<?>) val;
        for (int i = 0; i < list.size(); i++) {
            if (!(list.get(i) instanceof String)) {
                throw new ValidationError(field + "." + i + ": Expected string, received " + typeName(list.get(i)));
            }
        }
        return (List<String>) val;
    }

    private static String validateEnum(Map<String, Object> args, String field, List<String> options,
                                       boolean required, String defaultVal) {
        Object val = args.get(field);
        if (val == null) {
            if (required) throw new ValidationError(field + ": Required");
            return defaultVal;
        }
        if (!(val instanceof String)) {
            throw new ValidationError(field + ": Expected string, received " + typeName(val));
        }
        String strVal = (String) val;
        if (!options.contains(strVal)) {
            String optStr = options.stream().map(o -> "'" + o + "'").collect(Collectors.joining(" | "));
            throw new ValidationError(field + ": Invalid enum value. Expected " + optStr + ", received '" + strVal + "'");
        }
        return strVal;
    }

    private static String typeName(Object val) {
        if (val == null) return "null";
        if (val instanceof String) return "string";
        if (val instanceof Boolean) return "boolean";
        if (val instanceof Number) return "number";
        if (val instanceof List) return "array";
        if (val instanceof Map) return "object";
        return val.getClass().getSimpleName();
    }

    // -----------------------------------------------------------------------
    // Operation handlers
    // -----------------------------------------------------------------------

    private static Map<String, Object> todosCreate(Object rawArgs) {
        Map<String, Object> args = asArgs(rawArgs);
        String title = validateString(args, "title", true);
        String description = validateString(args, "description", false);
        String dueDate = validateString(args, "dueDate", false);
        List<String> labels = validateStringArray(args, "labels", false);

        String now = nowIso();
        LinkedHashMap<String, Object> todo = new LinkedHashMap<>();
        todo.put("id", UUID.randomUUID().toString());
        todo.put("title", title);
        if (description != null) todo.put("description", description);
        if (dueDate != null) todo.put("dueDate", dueDate);
        if (labels != null) todo.put("labels", labels);
        todo.put("completed", false);
        todo.put("completedAt", null);
        todo.put("createdAt", now);
        todo.put("updatedAt", now);

        todos.put((String) todo.get("id"), todo);

        LinkedHashMap<String, Object> event = new LinkedHashMap<>();
        event.put("event", "created");
        event.put("todo", todo);
        event.put("timestamp", now);
        broadcast("created", event);

        LinkedHashMap<String, Object> result = new LinkedHashMap<>();
        result.put("ok", true);
        result.put("result", todo);
        return result;
    }

    private static Map<String, Object> todosGet(Object rawArgs) {
        Map<String, Object> args = asArgs(rawArgs);
        String id = validateString(args, "id", true);
        LinkedHashMap<String, Object> todo = todos.get(id);
        if (todo == null) {
            LinkedHashMap<String, Object> result = new LinkedHashMap<>();
            result.put("ok", false);
            LinkedHashMap<String, Object> error = new LinkedHashMap<>();
            error.put("code", "TODO_NOT_FOUND");
            error.put("message", "Todo with id '" + id + "' not found");
            result.put("error", error);
            return result;
        }
        LinkedHashMap<String, Object> result = new LinkedHashMap<>();
        result.put("ok", true);
        result.put("result", todo);
        return result;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> todosList(Object rawArgs) {
        Map<String, Object> args = asArgs(rawArgs);
        String cursor = validateString(args, "cursor", false);
        Integer limit = validateInt(args, "limit", false, 1, 100, 20);
        Boolean completed = validateBool(args, "completed", false);
        String label = validateString(args, "label", false);

        List<LinkedHashMap<String, Object>> items = new ArrayList<>(todos.values());

        // Apply filters
        if (completed != null) {
            items = items.stream()
                .filter(t -> completed.equals(t.get("completed")))
                .collect(Collectors.toList());
        }
        if (label != null) {
            items = items.stream()
                .filter(t -> {
                    Object labelsObj = t.get("labels");
                    if (labelsObj instanceof List) {
                        return ((List<String>) labelsObj).contains(label);
                    }
                    return false;
                })
                .collect(Collectors.toList());
        }

        int total = items.size();

        // Apply cursor pagination
        int startIndex = 0;
        if (cursor != null) {
            try {
                startIndex = Integer.parseInt(
                    new String(Base64.getDecoder().decode(cursor)));
            } catch (Exception e) {
                startIndex = 0;
            }
        }

        if (startIndex > items.size()) startIndex = items.size();
        int endIndex = Math.min(startIndex + limit, items.size());
        List<LinkedHashMap<String, Object>> paged = new ArrayList<>(items.subList(startIndex, endIndex));
        int nextIndex = startIndex + limit;
        String nextCursor = nextIndex < total ?
            Base64.getEncoder().encodeToString(String.valueOf(nextIndex).getBytes()) : null;

        LinkedHashMap<String, Object> listResult = new LinkedHashMap<>();
        listResult.put("items", paged);
        listResult.put("cursor", nextCursor);
        listResult.put("total", total);

        LinkedHashMap<String, Object> result = new LinkedHashMap<>();
        result.put("ok", true);
        result.put("result", listResult);
        return result;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> todosUpdate(Object rawArgs) {
        Map<String, Object> args = asArgs(rawArgs);
        String id = validateString(args, "id", true);
        String title = validateString(args, "title", false);
        String description = validateString(args, "description", false);
        String dueDate = validateString(args, "dueDate", false);
        List<String> labels = validateStringArray(args, "labels", false);
        Boolean completed = validateBool(args, "completed", false);

        LinkedHashMap<String, Object> todo = todos.get(id);
        if (todo == null) {
            LinkedHashMap<String, Object> result = new LinkedHashMap<>();
            result.put("ok", false);
            LinkedHashMap<String, Object> error = new LinkedHashMap<>();
            error.put("code", "TODO_NOT_FOUND");
            error.put("message", "Todo with id '" + id + "' not found");
            result.put("error", error);
            return result;
        }

        LinkedHashMap<String, Object> updated = new LinkedHashMap<>(todo);
        if (title != null) updated.put("title", title);
        if (description != null) updated.put("description", description);
        if (dueDate != null) updated.put("dueDate", dueDate);
        if (labels != null) updated.put("labels", labels);
        if (completed != null) updated.put("completed", completed);
        updated.put("updatedAt", nowIso());

        todos.put(id, updated);

        LinkedHashMap<String, Object> event = new LinkedHashMap<>();
        event.put("event", "updated");
        event.put("todo", updated);
        event.put("timestamp", updated.get("updatedAt"));
        broadcast("updated", event);

        LinkedHashMap<String, Object> result = new LinkedHashMap<>();
        result.put("ok", true);
        result.put("result", updated);
        return result;
    }

    private static Map<String, Object> todosDelete(Object rawArgs) {
        Map<String, Object> args = asArgs(rawArgs);
        String id = validateString(args, "id", true);
        LinkedHashMap<String, Object> todo = todos.get(id);
        if (todo == null) {
            LinkedHashMap<String, Object> result = new LinkedHashMap<>();
            result.put("ok", false);
            LinkedHashMap<String, Object> error = new LinkedHashMap<>();
            error.put("code", "TODO_NOT_FOUND");
            error.put("message", "Todo with id '" + id + "' not found");
            result.put("error", error);
            return result;
        }
        todos.remove(id);

        LinkedHashMap<String, Object> event = new LinkedHashMap<>();
        event.put("event", "deleted");
        event.put("todoId", id);
        event.put("timestamp", nowIso());
        broadcast("deleted", event);

        LinkedHashMap<String, Object> deleteResult = new LinkedHashMap<>();
        deleteResult.put("deleted", true);

        LinkedHashMap<String, Object> result = new LinkedHashMap<>();
        result.put("ok", true);
        result.put("result", deleteResult);
        return result;
    }

    private static Map<String, Object> todosComplete(Object rawArgs) {
        Map<String, Object> args = asArgs(rawArgs);
        String id = validateString(args, "id", true);
        LinkedHashMap<String, Object> todo = todos.get(id);
        if (todo == null) {
            LinkedHashMap<String, Object> result = new LinkedHashMap<>();
            result.put("ok", false);
            LinkedHashMap<String, Object> error = new LinkedHashMap<>();
            error.put("code", "TODO_NOT_FOUND");
            error.put("message", "Todo with id '" + id + "' not found");
            result.put("error", error);
            return result;
        }

        if (!Boolean.TRUE.equals(todo.get("completed"))) {
            String now = nowIso();
            todo.put("completed", true);
            todo.put("completedAt", now);
            todo.put("updatedAt", now);
            todos.put(id, todo);

            LinkedHashMap<String, Object> event = new LinkedHashMap<>();
            event.put("event", "completed");
            event.put("todo", todo);
            event.put("timestamp", now);
            broadcast("completed", event);
        }

        LinkedHashMap<String, Object> result = new LinkedHashMap<>();
        result.put("ok", true);
        result.put("result", todo);
        return result;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> todosExport(Object rawArgs, String requestId) {
        Map<String, Object> args = asArgs(rawArgs);
        String format = validateEnum(args, "format", List.of("csv", "json"), false, "csv");

        State.OperationInstance instance = State.createInstance(requestId, "v1:todos.export");

        Timer timer1 = new Timer(true);
        timer1.schedule(new java.util.TimerTask() {
            @Override
            public void run() {
                State.transitionTo(requestId, "pending");

                Timer timer2 = new Timer(true);
                timer2.schedule(new java.util.TimerTask() {
                    @Override
                    public void run() {
                        List<LinkedHashMap<String, Object>> items = new ArrayList<>(todos.values());
                        String data;
                        if ("csv".equals(format)) {
                            StringBuilder sb = new StringBuilder();
                            sb.append("id,title,completed,createdAt");
                            for (LinkedHashMap<String, Object> t : items) {
                                sb.append("\n");
                                sb.append(t.get("id")).append(",");
                                sb.append(t.get("title")).append(",");
                                sb.append(String.valueOf(t.get("completed")).toLowerCase()).append(",");
                                sb.append(t.get("createdAt"));
                            }
                            data = sb.toString();
                        } else {
                            try {
                                ObjectMapper mapper = new ObjectMapper();
                                data = mapper.writeValueAsString(items);
                            } catch (Exception e) {
                                data = "[]";
                            }
                        }

                        List<State.Chunk> chunks = State.buildChunks(data);

                        LinkedHashMap<String, Object> exportResult = new LinkedHashMap<>();
                        exportResult.put("format", format);
                        exportResult.put("data", data);
                        exportResult.put("count", items.size());

                        State.transitionTo(requestId, "complete", exportResult, null, chunks);
                    }
                }, 50);
            }
        }, 50);

        LinkedHashMap<String, Object> result = new LinkedHashMap<>();
        result.put("ok", true);
        result.put("async", true);
        result.put("requestId", instance.requestId);
        return result;
    }

    private static Map<String, Object> reportsGenerate(Object rawArgs, String requestId) {
        Map<String, Object> args = asArgs(rawArgs);
        String reportType = validateEnum(args, "type", List.of("summary", "detailed"), false, "summary");

        State.OperationInstance instance = State.createInstance(requestId, "v1:reports.generate");

        Timer timer1 = new Timer(true);
        timer1.schedule(new java.util.TimerTask() {
            @Override
            public void run() {
                State.transitionTo(requestId, "pending");

                Timer timer2 = new Timer(true);
                timer2.schedule(new java.util.TimerTask() {
                    @Override
                    public void run() {
                        List<LinkedHashMap<String, Object>> items = new ArrayList<>(todos.values());
                        long completedCount = items.stream()
                            .filter(t -> Boolean.TRUE.equals(t.get("completed")))
                            .count();

                        LinkedHashMap<String, Object> reportResult = new LinkedHashMap<>();
                        reportResult.put("type", reportType);
                        reportResult.put("totalTodos", items.size());
                        reportResult.put("completedTodos", (int) completedCount);
                        reportResult.put("pendingTodos", items.size() - (int) completedCount);
                        reportResult.put("generatedAt", nowIso());

                        State.transitionTo(requestId, "complete", reportResult, null, null);
                    }
                }, 50);
            }
        }, 50);

        LinkedHashMap<String, Object> result = new LinkedHashMap<>();
        result.put("ok", true);
        result.put("async", true);
        result.put("requestId", instance.requestId);
        return result;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> todosSearch(Object rawArgs) {
        Map<String, Object> args = asArgs(rawArgs);
        String query = validateString(args, "query", true);
        Integer limit = validateInt(args, "limit", false, 1, 100, 20);

        List<LinkedHashMap<String, Object>> items = todos.values().stream()
            .filter(t -> {
                String title = (String) t.get("title");
                return title != null && title.toLowerCase().contains(query.toLowerCase());
            })
            .collect(Collectors.toList());

        int total = items.size();
        List<LinkedHashMap<String, Object>> sliced = items.subList(0, Math.min(limit, items.size()));

        LinkedHashMap<String, Object> searchResult = new LinkedHashMap<>();
        searchResult.put("items", sliced);
        searchResult.put("cursor", null);
        searchResult.put("total", total);

        LinkedHashMap<String, Object> result = new LinkedHashMap<>();
        result.put("ok", true);
        result.put("result", searchResult);
        return result;
    }

    private static Map<String, Object> debugSimulateError(Object rawArgs) {
        Map<String, Object> args = asArgs(rawArgs);
        Integer statusCode = validateInt(args, "statusCode", true, null, null, null);
        String code = validateString(args, "code", false);
        if (code == null) code = "SIMULATED_ERROR";
        String message = validateString(args, "message", false);
        if (message == null) message = "Simulated error for testing";
        throw new ServerError(statusCode, code, message);
    }

    private static Map<String, Object> todosWatch(Object rawArgs) {
        Map<String, Object> args = asArgs(rawArgs);
        validateEnum(args, "filter", List.of("all", "completed", "pending"), false, "all");
        String sessionId = UUID.randomUUID().toString();
        registerStreamSession(sessionId);

        LinkedHashMap<String, Object> result = new LinkedHashMap<>();
        result.put("ok", true);
        result.put("stream", true);
        result.put("sessionId", sessionId);
        return result;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> todosAttach(Object rawArgs, MediaFile mediaFile) {
        Map<String, Object> args = asArgs(rawArgs);
        String todoId = validateString(args, "todoId", true);
        String ref = validateString(args, "ref", false);

        LinkedHashMap<String, Object> todo = todos.get(todoId);
        if (todo == null) {
            LinkedHashMap<String, Object> result = new LinkedHashMap<>();
            result.put("ok", false);
            LinkedHashMap<String, Object> error = new LinkedHashMap<>();
            error.put("code", "TODO_NOT_FOUND");
            error.put("message", "Todo with id '" + todoId + "' not found");
            result.put("error", error);
            return result;
        }

        // Handle ref URI (reference to external media)
        if (ref != null) {
            Media.StoredMedia media = Media.storeMedia(new byte[0], "application/octet-stream", ref);
            todo.put("attachmentId", media.id());
            LinkedHashMap<String, Object> location = new LinkedHashMap<>();
            location.put("uri", "/media/" + media.id());
            todo.put("location", location);
            todo.put("updatedAt", nowIso());
            todos.put(todoId, todo);

            LinkedHashMap<String, Object> attachResult = new LinkedHashMap<>();
            attachResult.put("todoId", todoId);
            attachResult.put("attachmentId", media.id());
            attachResult.put("contentType", "application/octet-stream");
            attachResult.put("filename", ref);

            LinkedHashMap<String, Object> result = new LinkedHashMap<>();
            result.put("ok", true);
            result.put("result", attachResult);
            return result;
        }

        // Handle inline multipart upload
        if (mediaFile == null) {
            LinkedHashMap<String, Object> result = new LinkedHashMap<>();
            result.put("ok", false);
            LinkedHashMap<String, Object> error = new LinkedHashMap<>();
            error.put("code", "MEDIA_REQUIRED");
            error.put("message", "File upload or ref URI is required");
            result.put("error", error);
            return result;
        }

        // Normalize content type (strip parameters like charset)
        String baseContentType = mediaFile.contentType().split(";")[0].trim();
        if (!Media.ACCEPTED_MEDIA_TYPES.contains(baseContentType)) {
            LinkedHashMap<String, Object> result = new LinkedHashMap<>();
            result.put("ok", false);
            LinkedHashMap<String, Object> error = new LinkedHashMap<>();
            error.put("code", "UNSUPPORTED_MEDIA_TYPE");
            error.put("message", "Unsupported media type: " + baseContentType +
                ". Accepted: " + String.join(", ", Media.ACCEPTED_MEDIA_TYPES));
            result.put("error", error);
            return result;
        }

        if (mediaFile.data().length > Media.MAX_MEDIA_BYTES) {
            LinkedHashMap<String, Object> result = new LinkedHashMap<>();
            result.put("ok", false);
            LinkedHashMap<String, Object> error = new LinkedHashMap<>();
            error.put("code", "MEDIA_TOO_LARGE");
            error.put("message", "File exceeds maximum size of " + Media.MAX_MEDIA_BYTES + " bytes");
            result.put("error", error);
            return result;
        }

        Media.StoredMedia media = Media.storeMedia(mediaFile.data(), baseContentType, mediaFile.filename());
        todo.put("attachmentId", media.id());
        LinkedHashMap<String, Object> location = new LinkedHashMap<>();
        location.put("uri", "/media/" + media.id());
        todo.put("location", location);
        todo.put("updatedAt", nowIso());
        todos.put(todoId, todo);

        LinkedHashMap<String, Object> attachResult = new LinkedHashMap<>();
        attachResult.put("todoId", todoId);
        attachResult.put("attachmentId", media.id());
        attachResult.put("contentType", mediaFile.contentType());
        attachResult.put("filename", mediaFile.filename());

        LinkedHashMap<String, Object> result = new LinkedHashMap<>();
        result.put("ok", true);
        result.put("result", attachResult);
        return result;
    }

    // -----------------------------------------------------------------------
    // Operation entry and registry
    // -----------------------------------------------------------------------

    public static class OperationEntry {
        public final Function<Object, Map<String, Object>> handler;
        public final BiFunction<Object, String, Map<String, Object>> asyncHandler;
        public final Function<Object, Map<String, Object>> streamHandler;
        public final boolean sideEffecting;
        public final List<String> authScopes;
        public final String executionModel;
        public final boolean deprecated;
        public final String sunset;
        public final String replacement;
        public final boolean acceptsMedia;

        public OperationEntry(
            Function<Object, Map<String, Object>> handler,
            BiFunction<Object, String, Map<String, Object>> asyncHandler,
            Function<Object, Map<String, Object>> streamHandler,
            boolean sideEffecting,
            List<String> authScopes,
            String executionModel,
            boolean deprecated,
            String sunset,
            String replacement,
            boolean acceptsMedia
        ) {
            this.handler = handler;
            this.asyncHandler = asyncHandler;
            this.streamHandler = streamHandler;
            this.sideEffecting = sideEffecting;
            this.authScopes = authScopes;
            this.executionModel = executionModel;
            this.deprecated = deprecated;
            this.sunset = sunset;
            this.replacement = replacement;
            this.acceptsMedia = acceptsMedia;
        }
    }

    // Handler wrapper for attach that takes MediaFile
    private static BiFunction<Object, MediaFile, Map<String, Object>> todosAttachHandler =
        Operations::todosAttach;

    public static Map<String, Object> callAttachHandler(Object args, MediaFile mediaFile) {
        return todosAttachHandler.apply(args, mediaFile);
    }

    public static final Map<String, OperationEntry> OPERATIONS;

    static {
        Map<String, OperationEntry> ops = new LinkedHashMap<>();

        ops.put("v1:todos.create", new OperationEntry(
            Operations::todosCreate, null, null,
            true, List.of("todos:write"), "sync",
            false, null, null, false
        ));

        ops.put("v1:todos.get", new OperationEntry(
            Operations::todosGet, null, null,
            false, List.of("todos:read"), "sync",
            false, null, null, false
        ));

        ops.put("v1:todos.list", new OperationEntry(
            Operations::todosList, null, null,
            false, List.of("todos:read"), "sync",
            false, null, null, false
        ));

        ops.put("v1:todos.update", new OperationEntry(
            Operations::todosUpdate, null, null,
            true, List.of("todos:write"), "sync",
            false, null, null, false
        ));

        ops.put("v1:todos.delete", new OperationEntry(
            Operations::todosDelete, null, null,
            true, List.of("todos:write"), "sync",
            false, null, null, false
        ));

        ops.put("v1:todos.complete", new OperationEntry(
            Operations::todosComplete, null, null,
            true, List.of("todos:write"), "sync",
            false, null, null, false
        ));

        ops.put("v1:todos.export", new OperationEntry(
            null, Operations::todosExport, null,
            false, List.of("todos:read"), "async",
            false, null, null, false
        ));

        ops.put("v1:reports.generate", new OperationEntry(
            null, Operations::reportsGenerate, null,
            false, List.of("reports:read"), "async",
            false, null, null, false
        ));

        ops.put("v1:todos.search", new OperationEntry(
            Operations::todosSearch, null, null,
            false, List.of("todos:read"), "sync",
            true, "2025-01-01", "v1:todos.list", false
        ));

        ops.put("v1:debug.simulateError", new OperationEntry(
            Operations::debugSimulateError, null, null,
            false, List.of(), "sync",
            false, null, null, false
        ));

        ops.put("v1:todos.attach", new OperationEntry(
            null, null, null,
            true, List.of("todos:write"), "sync",
            false, null, null, true
        ));

        ops.put("v1:todos.watch", new OperationEntry(
            null, null, Operations::todosWatch,
            false, List.of("todos:read"), "stream",
            false, null, null, false
        ));

        OPERATIONS = Collections.unmodifiableMap(ops);
    }
}
