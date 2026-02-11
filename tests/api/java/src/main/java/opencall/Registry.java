package opencall;

import java.util.*;

/**
 * Hardcoded JSON Schema registry for the OpenCALL Todo API.
 * Matches the exact output of zod-to-json-schema from the TypeScript implementation.
 */
public final class Registry {

    private static Map<String, Object> todoSchema() {
        LinkedHashMap<String, Object> schema = new LinkedHashMap<>();
        schema.put("type", "object");

        LinkedHashMap<String, Object> props = new LinkedHashMap<>();
        props.put("id", Map.of("type", "string"));
        props.put("title", Map.of("type", "string"));
        props.put("description", Map.of("type", "string"));
        props.put("dueDate", Map.of("type", "string"));
        props.put("labels", orderedMap("type", "array", "items", Map.of("type", "string")));
        props.put("completed", Map.of("type", "boolean"));
        props.put("completedAt", Map.of("type", List.of("string", "null")));
        props.put("createdAt", Map.of("type", "string"));
        props.put("updatedAt", Map.of("type", "string"));
        props.put("attachmentId", Map.of("type", "string"));

        LinkedHashMap<String, Object> locationProps = new LinkedHashMap<>();
        locationProps.put("uri", Map.of("type", "string"));
        locationProps.put("method", Map.of("type", "string"));
        locationProps.put("headers", orderedMap("type", "object", "additionalProperties", Map.of("type", "string")));

        LinkedHashMap<String, Object> locationSchema = new LinkedHashMap<>();
        locationSchema.put("type", "object");
        locationSchema.put("properties", locationProps);
        locationSchema.put("required", List.of("uri"));
        locationSchema.put("additionalProperties", false);
        props.put("location", locationSchema);

        schema.put("properties", props);
        schema.put("required", List.of("id", "title", "completed", "createdAt", "updatedAt"));
        schema.put("additionalProperties", false);
        return schema;
    }

    private static Map<String, Object> listTodosResultSchema() {
        LinkedHashMap<String, Object> schema = new LinkedHashMap<>();
        schema.put("type", "object");

        LinkedHashMap<String, Object> props = new LinkedHashMap<>();
        props.put("items", orderedMap("type", "array", "items", todoSchema()));
        props.put("cursor", Map.of("type", List.of("string", "null")));
        props.put("total", Map.of("type", "integer"));

        schema.put("properties", props);
        schema.put("required", List.of("items", "cursor", "total"));
        schema.put("additionalProperties", false);
        return schema;
    }

    private static Map<String, Object> watchTodosFrameSchema() {
        LinkedHashMap<String, Object> schema = new LinkedHashMap<>();
        schema.put("type", "object");

        LinkedHashMap<String, Object> props = new LinkedHashMap<>();

        LinkedHashMap<String, Object> eventProp = new LinkedHashMap<>();
        eventProp.put("type", "string");
        eventProp.put("enum", List.of("created", "updated", "deleted", "completed"));
        props.put("event", eventProp);

        props.put("todo", todoSchema());
        props.put("todoId", Map.of("type", "string"));
        props.put("timestamp", Map.of("type", "string"));

        schema.put("properties", props);
        schema.put("required", List.of("event", "timestamp"));
        schema.put("additionalProperties", false);
        return schema;
    }

    public static Map<String, Object> buildRegistry() {
        LinkedHashMap<String, Object> registry = new LinkedHashMap<>();
        registry.put("callVersion", "2026-02-10");

        List<Map<String, Object>> operations = new ArrayList<>();

        // v1:todos.create
        {
            LinkedHashMap<String, Object> op = new LinkedHashMap<>();
            op.put("op", "v1:todos.create");
            op.put("description", "Create a new todo item");

            LinkedHashMap<String, Object> argsSchema = new LinkedHashMap<>();
            argsSchema.put("type", "object");
            LinkedHashMap<String, Object> argsProps = new LinkedHashMap<>();
            argsProps.put("title", Map.of("type", "string"));
            argsProps.put("description", Map.of("type", "string"));
            argsProps.put("dueDate", Map.of("type", "string"));
            argsProps.put("labels", orderedMap("type", "array", "items", Map.of("type", "string")));
            argsSchema.put("properties", argsProps);
            argsSchema.put("required", List.of("title"));
            argsSchema.put("additionalProperties", false);
            op.put("argsSchema", argsSchema);

            op.put("resultSchema", todoSchema());
            op.put("sideEffecting", true);
            op.put("idempotencyRequired", true);
            op.put("executionModel", "sync");
            op.put("authScopes", List.of("todos:write"));
            operations.add(op);
        }

        // v1:todos.get
        {
            LinkedHashMap<String, Object> op = new LinkedHashMap<>();
            op.put("op", "v1:todos.get");
            op.put("description", "Get a todo item by ID");

            LinkedHashMap<String, Object> argsSchema = new LinkedHashMap<>();
            argsSchema.put("type", "object");
            LinkedHashMap<String, Object> argsProps = new LinkedHashMap<>();
            argsProps.put("id", Map.of("type", "string"));
            argsSchema.put("properties", argsProps);
            argsSchema.put("required", List.of("id"));
            argsSchema.put("additionalProperties", false);
            op.put("argsSchema", argsSchema);

            op.put("resultSchema", todoSchema());
            op.put("sideEffecting", false);
            op.put("idempotencyRequired", false);
            op.put("executionModel", "sync");
            op.put("authScopes", List.of("todos:read"));
            operations.add(op);
        }

        // v1:todos.list
        {
            LinkedHashMap<String, Object> op = new LinkedHashMap<>();
            op.put("op", "v1:todos.list");
            op.put("description", "List todo items with optional filters and pagination");

            LinkedHashMap<String, Object> argsSchema = new LinkedHashMap<>();
            argsSchema.put("type", "object");
            LinkedHashMap<String, Object> argsProps = new LinkedHashMap<>();
            argsProps.put("cursor", Map.of("type", "string"));

            LinkedHashMap<String, Object> limitProp = new LinkedHashMap<>();
            limitProp.put("type", "integer");
            limitProp.put("minimum", 1);
            limitProp.put("maximum", 100);
            limitProp.put("default", 20);
            argsProps.put("limit", limitProp);

            argsProps.put("completed", Map.of("type", "boolean"));
            argsProps.put("label", Map.of("type", "string"));
            argsSchema.put("properties", argsProps);
            argsSchema.put("additionalProperties", false);
            op.put("argsSchema", argsSchema);

            op.put("resultSchema", listTodosResultSchema());
            op.put("sideEffecting", false);
            op.put("idempotencyRequired", false);
            op.put("executionModel", "sync");
            op.put("authScopes", List.of("todos:read"));
            operations.add(op);
        }

        // v1:todos.update
        {
            LinkedHashMap<String, Object> op = new LinkedHashMap<>();
            op.put("op", "v1:todos.update");
            op.put("description", "Update a todo item");

            LinkedHashMap<String, Object> argsSchema = new LinkedHashMap<>();
            argsSchema.put("type", "object");
            LinkedHashMap<String, Object> argsProps = new LinkedHashMap<>();
            argsProps.put("id", Map.of("type", "string"));
            argsProps.put("title", Map.of("type", "string"));
            argsProps.put("description", Map.of("type", "string"));
            argsProps.put("dueDate", Map.of("type", "string"));
            argsProps.put("labels", orderedMap("type", "array", "items", Map.of("type", "string")));
            argsProps.put("completed", Map.of("type", "boolean"));
            argsSchema.put("properties", argsProps);
            argsSchema.put("required", List.of("id"));
            argsSchema.put("additionalProperties", false);
            op.put("argsSchema", argsSchema);

            op.put("resultSchema", todoSchema());
            op.put("sideEffecting", true);
            op.put("idempotencyRequired", true);
            op.put("executionModel", "sync");
            op.put("authScopes", List.of("todos:write"));
            operations.add(op);
        }

        // v1:todos.delete
        {
            LinkedHashMap<String, Object> op = new LinkedHashMap<>();
            op.put("op", "v1:todos.delete");
            op.put("description", "Delete a todo item");

            LinkedHashMap<String, Object> argsSchema = new LinkedHashMap<>();
            argsSchema.put("type", "object");
            LinkedHashMap<String, Object> argsProps = new LinkedHashMap<>();
            argsProps.put("id", Map.of("type", "string"));
            argsSchema.put("properties", argsProps);
            argsSchema.put("required", List.of("id"));
            argsSchema.put("additionalProperties", false);
            op.put("argsSchema", argsSchema);

            LinkedHashMap<String, Object> resultSchema = new LinkedHashMap<>();
            resultSchema.put("type", "object");
            LinkedHashMap<String, Object> resultProps = new LinkedHashMap<>();
            resultProps.put("deleted", Map.of("type", "boolean"));
            resultSchema.put("properties", resultProps);
            resultSchema.put("required", List.of("deleted"));
            resultSchema.put("additionalProperties", false);
            op.put("resultSchema", resultSchema);

            op.put("sideEffecting", true);
            op.put("idempotencyRequired", true);
            op.put("executionModel", "sync");
            op.put("authScopes", List.of("todos:write"));
            operations.add(op);
        }

        // v1:todos.complete
        {
            LinkedHashMap<String, Object> op = new LinkedHashMap<>();
            op.put("op", "v1:todos.complete");
            op.put("description", "Mark a todo item as complete");

            LinkedHashMap<String, Object> argsSchema = new LinkedHashMap<>();
            argsSchema.put("type", "object");
            LinkedHashMap<String, Object> argsProps = new LinkedHashMap<>();
            argsProps.put("id", Map.of("type", "string"));
            argsSchema.put("properties", argsProps);
            argsSchema.put("required", List.of("id"));
            argsSchema.put("additionalProperties", false);
            op.put("argsSchema", argsSchema);

            op.put("resultSchema", todoSchema());
            op.put("sideEffecting", true);
            op.put("idempotencyRequired", true);
            op.put("executionModel", "sync");
            op.put("authScopes", List.of("todos:write"));
            operations.add(op);
        }

        // v1:todos.export
        {
            LinkedHashMap<String, Object> op = new LinkedHashMap<>();
            op.put("op", "v1:todos.export");
            op.put("description", "Export all todos in CSV or JSON format");

            LinkedHashMap<String, Object> argsSchema = new LinkedHashMap<>();
            argsSchema.put("type", "object");
            LinkedHashMap<String, Object> argsProps = new LinkedHashMap<>();
            LinkedHashMap<String, Object> formatProp = new LinkedHashMap<>();
            formatProp.put("type", "string");
            formatProp.put("enum", List.of("csv", "json"));
            formatProp.put("default", "csv");
            argsProps.put("format", formatProp);
            argsSchema.put("properties", argsProps);
            argsSchema.put("additionalProperties", false);
            op.put("argsSchema", argsSchema);

            LinkedHashMap<String, Object> resultSchema = new LinkedHashMap<>();
            resultSchema.put("type", "object");
            LinkedHashMap<String, Object> resultProps = new LinkedHashMap<>();
            resultProps.put("format", Map.of("type", "string"));
            resultProps.put("data", Map.of("type", "string"));
            resultProps.put("count", Map.of("type", "integer"));
            resultSchema.put("properties", resultProps);
            resultSchema.put("required", List.of("format", "data", "count"));
            resultSchema.put("additionalProperties", false);
            op.put("resultSchema", resultSchema);

            op.put("sideEffecting", false);
            op.put("idempotencyRequired", false);
            op.put("executionModel", "async");
            op.put("authScopes", List.of("todos:read"));
            operations.add(op);
        }

        // v1:reports.generate
        {
            LinkedHashMap<String, Object> op = new LinkedHashMap<>();
            op.put("op", "v1:reports.generate");
            op.put("description", "Generate a summary report of todos");

            LinkedHashMap<String, Object> argsSchema = new LinkedHashMap<>();
            argsSchema.put("type", "object");
            LinkedHashMap<String, Object> argsProps = new LinkedHashMap<>();
            LinkedHashMap<String, Object> typeProp = new LinkedHashMap<>();
            typeProp.put("type", "string");
            typeProp.put("enum", List.of("summary", "detailed"));
            typeProp.put("default", "summary");
            argsProps.put("type", typeProp);
            argsSchema.put("properties", argsProps);
            argsSchema.put("additionalProperties", false);
            op.put("argsSchema", argsSchema);

            LinkedHashMap<String, Object> resultSchema = new LinkedHashMap<>();
            resultSchema.put("type", "object");
            LinkedHashMap<String, Object> resultProps = new LinkedHashMap<>();
            resultProps.put("type", Map.of("type", "string"));
            resultProps.put("totalTodos", Map.of("type", "integer"));
            resultProps.put("completedTodos", Map.of("type", "integer"));
            resultProps.put("pendingTodos", Map.of("type", "integer"));
            resultProps.put("generatedAt", Map.of("type", "string"));
            resultSchema.put("properties", resultProps);
            resultSchema.put("required", List.of("type", "totalTodos", "completedTodos", "pendingTodos", "generatedAt"));
            resultSchema.put("additionalProperties", false);
            op.put("resultSchema", resultSchema);

            op.put("sideEffecting", false);
            op.put("idempotencyRequired", false);
            op.put("executionModel", "async");
            op.put("authScopes", List.of("reports:read"));
            operations.add(op);
        }

        // v1:todos.search
        {
            LinkedHashMap<String, Object> op = new LinkedHashMap<>();
            op.put("op", "v1:todos.search");
            op.put("description", "Search todos by query (deprecated, use v1:todos.list with label filter)");

            LinkedHashMap<String, Object> argsSchema = new LinkedHashMap<>();
            argsSchema.put("type", "object");
            LinkedHashMap<String, Object> argsProps = new LinkedHashMap<>();
            argsProps.put("query", Map.of("type", "string"));
            LinkedHashMap<String, Object> limitProp = new LinkedHashMap<>();
            limitProp.put("type", "integer");
            limitProp.put("minimum", 1);
            limitProp.put("maximum", 100);
            limitProp.put("default", 20);
            argsProps.put("limit", limitProp);
            argsSchema.put("properties", argsProps);
            argsSchema.put("required", List.of("query"));
            argsSchema.put("additionalProperties", false);
            op.put("argsSchema", argsSchema);

            op.put("resultSchema", listTodosResultSchema());
            op.put("sideEffecting", false);
            op.put("idempotencyRequired", false);
            op.put("executionModel", "sync");
            op.put("authScopes", List.of("todos:read"));
            op.put("deprecated", true);
            op.put("sunset", "2025-01-01");
            op.put("replacement", "v1:todos.list");
            operations.add(op);
        }

        // v1:debug.simulateError
        {
            LinkedHashMap<String, Object> op = new LinkedHashMap<>();
            op.put("op", "v1:debug.simulateError");
            op.put("description", "Simulate a server error for testing (test-only)");

            LinkedHashMap<String, Object> argsSchema = new LinkedHashMap<>();
            argsSchema.put("type", "object");
            LinkedHashMap<String, Object> argsProps = new LinkedHashMap<>();
            argsProps.put("statusCode", Map.of("type", "integer"));
            LinkedHashMap<String, Object> codeProp = new LinkedHashMap<>();
            codeProp.put("type", "string");
            codeProp.put("default", "SIMULATED_ERROR");
            argsProps.put("code", codeProp);
            LinkedHashMap<String, Object> messageProp = new LinkedHashMap<>();
            messageProp.put("type", "string");
            messageProp.put("default", "Simulated error for testing");
            argsProps.put("message", messageProp);
            argsSchema.put("properties", argsProps);
            argsSchema.put("required", List.of("statusCode"));
            argsSchema.put("additionalProperties", false);
            op.put("argsSchema", argsSchema);

            LinkedHashMap<String, Object> resultSchema = new LinkedHashMap<>();
            resultSchema.put("type", "object");
            LinkedHashMap<String, Object> resultProps = new LinkedHashMap<>();
            resultProps.put("simulated", Map.of("type", "boolean"));
            resultSchema.put("properties", resultProps);
            resultSchema.put("required", List.of("simulated"));
            resultSchema.put("additionalProperties", false);
            op.put("resultSchema", resultSchema);

            op.put("sideEffecting", false);
            op.put("idempotencyRequired", false);
            op.put("executionModel", "sync");
            op.put("authScopes", List.of());
            operations.add(op);
        }

        // v1:todos.watch
        {
            LinkedHashMap<String, Object> op = new LinkedHashMap<>();
            op.put("op", "v1:todos.watch");
            op.put("description", "Watch for changes to todo items via WebSocket stream");

            LinkedHashMap<String, Object> argsSchema = new LinkedHashMap<>();
            argsSchema.put("type", "object");
            LinkedHashMap<String, Object> argsProps = new LinkedHashMap<>();
            LinkedHashMap<String, Object> filterProp = new LinkedHashMap<>();
            filterProp.put("type", "string");
            filterProp.put("enum", List.of("all", "completed", "pending"));
            filterProp.put("default", "all");
            argsProps.put("filter", filterProp);
            argsSchema.put("properties", argsProps);
            argsSchema.put("additionalProperties", false);
            op.put("argsSchema", argsSchema);

            op.put("resultSchema", watchTodosFrameSchema());
            op.put("sideEffecting", false);
            op.put("idempotencyRequired", false);
            op.put("executionModel", "stream");
            op.put("authScopes", List.of("todos:read"));
            op.put("supportedTransports", List.of("wss"));
            op.put("supportedEncodings", List.of("json"));
            op.put("frameSchema", watchTodosFrameSchema());
            op.put("ttlSeconds", 3600);
            operations.add(op);
        }

        // v1:todos.attach
        {
            LinkedHashMap<String, Object> op = new LinkedHashMap<>();
            op.put("op", "v1:todos.attach");
            op.put("description", "Attach a file to a todo item");

            LinkedHashMap<String, Object> argsSchema = new LinkedHashMap<>();
            argsSchema.put("type", "object");
            LinkedHashMap<String, Object> argsProps = new LinkedHashMap<>();
            argsProps.put("todoId", Map.of("type", "string"));
            argsProps.put("ref", Map.of("type", "string"));
            argsSchema.put("properties", argsProps);
            argsSchema.put("required", List.of("todoId"));
            argsSchema.put("additionalProperties", false);
            op.put("argsSchema", argsSchema);

            LinkedHashMap<String, Object> resultSchema = new LinkedHashMap<>();
            resultSchema.put("type", "object");
            LinkedHashMap<String, Object> resultProps = new LinkedHashMap<>();
            resultProps.put("todoId", Map.of("type", "string"));
            resultProps.put("attachmentId", Map.of("type", "string"));
            resultProps.put("contentType", Map.of("type", "string"));
            resultProps.put("filename", Map.of("type", "string"));
            resultSchema.put("properties", resultProps);
            resultSchema.put("required", List.of("todoId", "attachmentId", "contentType", "filename"));
            resultSchema.put("additionalProperties", false);
            op.put("resultSchema", resultSchema);

            op.put("sideEffecting", true);
            op.put("idempotencyRequired", true);
            op.put("executionModel", "sync");
            op.put("authScopes", List.of("todos:write"));

            LinkedHashMap<String, Object> mediaSchema = new LinkedHashMap<>();
            mediaSchema.put("name", "file");
            mediaSchema.put("required", false);
            mediaSchema.put("acceptedTypes", List.of("image/png", "image/jpeg", "application/pdf", "text/plain"));
            mediaSchema.put("maxBytes", 10485760);
            op.put("mediaSchema", mediaSchema);

            operations.add(op);
        }

        registry.put("operations", operations);
        return registry;
    }

    /**
     * Helper to create a LinkedHashMap with ordered key-value pairs.
     */
    private static LinkedHashMap<String, Object> orderedMap(Object... kvPairs) {
        LinkedHashMap<String, Object> map = new LinkedHashMap<>();
        for (int i = 0; i < kvPairs.length; i += 2) {
            map.put((String) kvPairs[i], kvPairs[i + 1]);
        }
        return map;
    }
}
