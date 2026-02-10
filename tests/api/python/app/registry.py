"""
Operation registry builder for the OpenCALL Todo API.
JSON Schema definitions match the exact output of zod-to-json-schema.
"""

from __future__ import annotations

# ---------------------------------------------------------------------------
# Shared sub-schemas
# ---------------------------------------------------------------------------

_TODO_SCHEMA = {
    "type": "object",
    "properties": {
        "id": {"type": "string"},
        "title": {"type": "string"},
        "description": {"type": "string"},
        "dueDate": {"type": "string"},
        "labels": {"type": "array", "items": {"type": "string"}},
        "completed": {"type": "boolean"},
        "completedAt": {"type": ["string", "null"]},
        "createdAt": {"type": "string"},
        "updatedAt": {"type": "string"},
        "attachmentId": {"type": "string"},
        "location": {
            "type": "object",
            "properties": {
                "uri": {"type": "string"},
                "method": {"type": "string"},
                "headers": {
                    "type": "object",
                    "additionalProperties": {"type": "string"},
                },
            },
            "required": ["uri"],
            "additionalProperties": False,
        },
    },
    "required": ["id", "title", "completed", "createdAt", "updatedAt"],
    "additionalProperties": False,
}

_LIST_TODOS_RESULT_SCHEMA = {
    "type": "object",
    "properties": {
        "items": {
            "type": "array",
            "items": _TODO_SCHEMA,
        },
        "cursor": {"type": ["string", "null"]},
        "total": {"type": "integer"},
    },
    "required": ["items", "cursor", "total"],
    "additionalProperties": False,
}

_WATCH_TODOS_FRAME_SCHEMA = {
    "type": "object",
    "properties": {
        "event": {
            "type": "string",
            "enum": ["created", "updated", "deleted", "completed"],
        },
        "todo": _TODO_SCHEMA,
        "todoId": {"type": "string"},
        "timestamp": {"type": "string"},
    },
    "required": ["event", "timestamp"],
    "additionalProperties": False,
}


# ---------------------------------------------------------------------------
# Builder
# ---------------------------------------------------------------------------

def build_registry() -> dict:
    return {
        "callVersion": "2026-02-10",
        "operations": [
            {
                "op": "v1:todos.create",
                "description": "Create a new todo item",
                "argsSchema": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string"},
                        "description": {"type": "string"},
                        "dueDate": {"type": "string"},
                        "labels": {"type": "array", "items": {"type": "string"}},
                    },
                    "required": ["title"],
                    "additionalProperties": False,
                },
                "resultSchema": _TODO_SCHEMA,
                "sideEffecting": True,
                "idempotencyRequired": True,
                "executionModel": "sync",
                "authScopes": ["todos:write"],
            },
            {
                "op": "v1:todos.get",
                "description": "Get a todo item by ID",
                "argsSchema": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "string"},
                    },
                    "required": ["id"],
                    "additionalProperties": False,
                },
                "resultSchema": _TODO_SCHEMA,
                "sideEffecting": False,
                "idempotencyRequired": False,
                "executionModel": "sync",
                "authScopes": ["todos:read"],
            },
            {
                "op": "v1:todos.list",
                "description": "List todo items with optional filters and pagination",
                "argsSchema": {
                    "type": "object",
                    "properties": {
                        "cursor": {"type": "string"},
                        "limit": {
                            "type": "integer",
                            "minimum": 1,
                            "maximum": 100,
                            "default": 20,
                        },
                        "completed": {"type": "boolean"},
                        "label": {"type": "string"},
                    },
                    "additionalProperties": False,
                },
                "resultSchema": _LIST_TODOS_RESULT_SCHEMA,
                "sideEffecting": False,
                "idempotencyRequired": False,
                "executionModel": "sync",
                "authScopes": ["todos:read"],
            },
            {
                "op": "v1:todos.update",
                "description": "Update a todo item",
                "argsSchema": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "string"},
                        "title": {"type": "string"},
                        "description": {"type": "string"},
                        "dueDate": {"type": "string"},
                        "labels": {"type": "array", "items": {"type": "string"}},
                        "completed": {"type": "boolean"},
                    },
                    "required": ["id"],
                    "additionalProperties": False,
                },
                "resultSchema": _TODO_SCHEMA,
                "sideEffecting": True,
                "idempotencyRequired": True,
                "executionModel": "sync",
                "authScopes": ["todos:write"],
            },
            {
                "op": "v1:todos.delete",
                "description": "Delete a todo item",
                "argsSchema": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "string"},
                    },
                    "required": ["id"],
                    "additionalProperties": False,
                },
                "resultSchema": {
                    "type": "object",
                    "properties": {
                        "deleted": {"type": "boolean"},
                    },
                    "required": ["deleted"],
                    "additionalProperties": False,
                },
                "sideEffecting": True,
                "idempotencyRequired": True,
                "executionModel": "sync",
                "authScopes": ["todos:write"],
            },
            {
                "op": "v1:todos.complete",
                "description": "Mark a todo item as complete",
                "argsSchema": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "string"},
                    },
                    "required": ["id"],
                    "additionalProperties": False,
                },
                "resultSchema": _TODO_SCHEMA,
                "sideEffecting": True,
                "idempotencyRequired": True,
                "executionModel": "sync",
                "authScopes": ["todos:write"],
            },
            {
                "op": "v1:todos.export",
                "description": "Export all todos in CSV or JSON format",
                "argsSchema": {
                    "type": "object",
                    "properties": {
                        "format": {
                            "type": "string",
                            "enum": ["csv", "json"],
                            "default": "csv",
                        },
                    },
                    "additionalProperties": False,
                },
                "resultSchema": {
                    "type": "object",
                    "properties": {
                        "format": {"type": "string"},
                        "data": {"type": "string"},
                        "count": {"type": "integer"},
                    },
                    "required": ["format", "data", "count"],
                    "additionalProperties": False,
                },
                "sideEffecting": False,
                "idempotencyRequired": False,
                "executionModel": "async",
                "authScopes": ["todos:read"],
            },
            {
                "op": "v1:reports.generate",
                "description": "Generate a summary report of todos",
                "argsSchema": {
                    "type": "object",
                    "properties": {
                        "type": {
                            "type": "string",
                            "enum": ["summary", "detailed"],
                            "default": "summary",
                        },
                    },
                    "additionalProperties": False,
                },
                "resultSchema": {
                    "type": "object",
                    "properties": {
                        "type": {"type": "string"},
                        "totalTodos": {"type": "integer"},
                        "completedTodos": {"type": "integer"},
                        "pendingTodos": {"type": "integer"},
                        "generatedAt": {"type": "string"},
                    },
                    "required": ["type", "totalTodos", "completedTodos", "pendingTodos", "generatedAt"],
                    "additionalProperties": False,
                },
                "sideEffecting": False,
                "idempotencyRequired": False,
                "executionModel": "async",
                "authScopes": ["reports:read"],
            },
            {
                "op": "v1:todos.search",
                "description": "Search todos by query (deprecated, use v1:todos.list with label filter)",
                "argsSchema": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string"},
                        "limit": {
                            "type": "integer",
                            "minimum": 1,
                            "maximum": 100,
                            "default": 20,
                        },
                    },
                    "required": ["query"],
                    "additionalProperties": False,
                },
                "resultSchema": _LIST_TODOS_RESULT_SCHEMA,
                "sideEffecting": False,
                "idempotencyRequired": False,
                "executionModel": "sync",
                "authScopes": ["todos:read"],
                "deprecated": True,
                "sunset": "2025-01-01",
                "replacement": "v1:todos.list",
            },
            {
                "op": "v1:debug.simulateError",
                "description": "Simulate a server error for testing (test-only)",
                "argsSchema": {
                    "type": "object",
                    "properties": {
                        "statusCode": {"type": "integer"},
                        "code": {"type": "string", "default": "SIMULATED_ERROR"},
                        "message": {"type": "string", "default": "Simulated error for testing"},
                    },
                    "required": ["statusCode"],
                    "additionalProperties": False,
                },
                "resultSchema": {
                    "type": "object",
                    "properties": {
                        "simulated": {"type": "boolean"},
                    },
                    "required": ["simulated"],
                    "additionalProperties": False,
                },
                "sideEffecting": False,
                "idempotencyRequired": False,
                "executionModel": "sync",
                "authScopes": [],
            },
            {
                "op": "v1:todos.watch",
                "description": "Watch for changes to todo items via WebSocket stream",
                "argsSchema": {
                    "type": "object",
                    "properties": {
                        "filter": {
                            "type": "string",
                            "enum": ["all", "completed", "pending"],
                            "default": "all",
                        },
                    },
                    "additionalProperties": False,
                },
                "resultSchema": _WATCH_TODOS_FRAME_SCHEMA,
                "sideEffecting": False,
                "idempotencyRequired": False,
                "executionModel": "stream",
                "authScopes": ["todos:read"],
                "supportedTransports": ["wss"],
                "supportedEncodings": ["json"],
                "frameSchema": _WATCH_TODOS_FRAME_SCHEMA,
                "ttlSeconds": 3600,
            },
            {
                "op": "v1:todos.attach",
                "description": "Attach a file to a todo item",
                "argsSchema": {
                    "type": "object",
                    "properties": {
                        "todoId": {"type": "string"},
                        "ref": {"type": "string"},
                    },
                    "required": ["todoId"],
                    "additionalProperties": False,
                },
                "resultSchema": {
                    "type": "object",
                    "properties": {
                        "todoId": {"type": "string"},
                        "attachmentId": {"type": "string"},
                        "contentType": {"type": "string"},
                        "filename": {"type": "string"},
                    },
                    "required": ["todoId", "attachmentId", "contentType", "filename"],
                    "additionalProperties": False,
                },
                "sideEffecting": True,
                "idempotencyRequired": True,
                "executionModel": "sync",
                "authScopes": ["todos:write"],
                "mediaSchema": {
                    "name": "file",
                    "required": False,
                    "acceptedTypes": ["image/png", "image/jpeg", "application/pdf", "text/plain"],
                    "maxBytes": 10485760,
                },
            },
        ],
    }
