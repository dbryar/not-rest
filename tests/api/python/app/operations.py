"""
All operation handlers for the OpenCALL Todo API.
"""

from __future__ import annotations

import uuid
import base64
import threading
from datetime import datetime, timezone
from typing import Any, Callable, Optional

from .state import create_instance, transition_to, build_chunks
from .media import store_media, ACCEPTED_MEDIA_TYPES, MAX_MEDIA_BYTES


# ---------------------------------------------------------------------------
# Stream session management
# ---------------------------------------------------------------------------

class StreamSession:
    __slots__ = ("session_id",)

    def __init__(self, session_id: str):
        self.session_id = session_id


_stream_sessions: dict[str, StreamSession] = {}
_broadcast_fn: Optional[Callable[[str, dict], None]] = None


def register_stream_session(session_id: str) -> StreamSession:
    session = StreamSession(session_id)
    _stream_sessions[session_id] = session
    return session


def get_stream_session(session_id: str) -> Optional[StreamSession]:
    return _stream_sessions.get(session_id)


def set_broadcast_fn(fn: Callable[[str, dict], None]) -> None:
    global _broadcast_fn
    _broadcast_fn = fn


def broadcast(event: str, data: dict) -> None:
    if _broadcast_fn is not None:
        _broadcast_fn(event, data)


def reset_stream_sessions() -> None:
    global _broadcast_fn
    _stream_sessions.clear()
    _broadcast_fn = None


# ---------------------------------------------------------------------------
# In-memory storage
# ---------------------------------------------------------------------------

_todos: dict[str, dict] = {}
_idempotency_store: dict[str, Any] = {}


def get_todos_store() -> dict[str, dict]:
    return _todos


def get_idempotency_store() -> dict[str, Any]:
    return _idempotency_store


def reset_storage() -> None:
    _todos.clear()
    _idempotency_store.clear()


# ---------------------------------------------------------------------------
# Validation error helper
# ---------------------------------------------------------------------------

class ValidationError(Exception):
    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


class ServerError(Exception):
    def __init__(self, status_code: int, code: str, message: str):
        self.status_code = status_code
        self.code = code
        self.message = message
        super().__init__(message)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _validate_string(args: dict, field: str, required: bool = False) -> Optional[str]:
    val = args.get(field)
    if val is None:
        if required:
            raise ValidationError(f"{field}: Required")
        return None
    if not isinstance(val, str):
        raise ValidationError(f"{field}: Expected string, received {type(val).__name__}")
    return val


def _validate_int(args: dict, field: str, required: bool = False,
                   minimum: Optional[int] = None, maximum: Optional[int] = None,
                   default: Optional[int] = None) -> Optional[int]:
    val = args.get(field)
    if val is None:
        if required:
            raise ValidationError(f"{field}: Required")
        return default
    if isinstance(val, bool):
        raise ValidationError(f"{field}: Expected number, received boolean")
    if not isinstance(val, (int, float)):
        raise ValidationError(f"{field}: Expected number, received {type(val).__name__}")
    val = int(val)
    if minimum is not None and val < minimum:
        raise ValidationError(f"{field}: Number must be greater than or equal to {minimum}")
    if maximum is not None and val > maximum:
        raise ValidationError(f"{field}: Number must be less than or equal to {maximum}")
    return val


def _validate_bool(args: dict, field: str, required: bool = False) -> Optional[bool]:
    val = args.get(field)
    if val is None:
        if required:
            raise ValidationError(f"{field}: Required")
        return None
    if not isinstance(val, bool):
        raise ValidationError(f"{field}: Expected boolean, received {type(val).__name__}")
    return val


def _validate_string_array(args: dict, field: str, required: bool = False) -> Optional[list[str]]:
    val = args.get(field)
    if val is None:
        if required:
            raise ValidationError(f"{field}: Required")
        return None
    if not isinstance(val, list):
        raise ValidationError(f"{field}: Expected array, received {type(val).__name__}")
    for i, item in enumerate(val):
        if not isinstance(item, str):
            raise ValidationError(f"{field}.{i}: Expected string, received {type(item).__name__}")
    return val


def _validate_enum(args: dict, field: str, options: list[str],
                    required: bool = False, default: Optional[str] = None) -> Optional[str]:
    val = args.get(field)
    if val is None:
        if required:
            raise ValidationError(f"{field}: Required")
        return default
    if not isinstance(val, str):
        raise ValidationError(f"{field}: Expected string, received {type(val).__name__}")
    if val not in options:
        raise ValidationError(
            f"{field}: Invalid enum value. Expected {' | '.join(repr(o) for o in options)}, received '{val}'"
        )
    return val


# ---------------------------------------------------------------------------
# Operation handlers
# ---------------------------------------------------------------------------

def todos_create(args: dict) -> dict:
    if args is None:
        args = {}
    title = _validate_string(args, "title", required=True)
    description = _validate_string(args, "description")
    due_date = _validate_string(args, "dueDate")
    labels = _validate_string_array(args, "labels")

    now = _now_iso()
    todo: dict[str, Any] = {
        "id": str(uuid.uuid4()),
        "title": title,
        "completed": False,
        "completedAt": None,
        "createdAt": now,
        "updatedAt": now,
    }
    if description is not None:
        todo["description"] = description
    if due_date is not None:
        todo["dueDate"] = due_date
    if labels is not None:
        todo["labels"] = labels

    _todos[todo["id"]] = todo
    broadcast("created", {"event": "created", "todo": todo, "timestamp": now})
    return {"ok": True, "result": todo}


def todos_get(args: dict) -> dict:
    if args is None:
        args = {}
    todo_id = _validate_string(args, "id", required=True)
    todo = _todos.get(todo_id)
    if not todo:
        return {
            "ok": False,
            "error": {"code": "TODO_NOT_FOUND", "message": f"Todo with id '{todo_id}' not found"},
        }
    return {"ok": True, "result": todo}


def todos_list(args: dict) -> dict:
    if args is None:
        args = {}
    cursor = _validate_string(args, "cursor")
    limit = _validate_int(args, "limit", minimum=1, maximum=100, default=20)
    completed = _validate_bool(args, "completed")
    label = _validate_string(args, "label")

    items = list(_todos.values())

    # Apply filters
    if completed is not None:
        items = [t for t in items if t.get("completed") == completed]
    if label is not None:
        items = [t for t in items if label in (t.get("labels") or [])]

    total = len(items)

    # Cursor pagination
    start_index = 0
    if cursor:
        try:
            start_index = int(base64.b64decode(cursor).decode())
        except Exception:
            start_index = 0

    paged = items[start_index:start_index + limit]
    next_index = start_index + limit
    next_cursor = base64.b64encode(str(next_index).encode()).decode() if next_index < total else None

    return {
        "ok": True,
        "result": {"items": paged, "cursor": next_cursor, "total": total},
    }


def todos_update(args: dict) -> dict:
    if args is None:
        args = {}
    todo_id = _validate_string(args, "id", required=True)
    title = _validate_string(args, "title")
    description = _validate_string(args, "description")
    due_date = _validate_string(args, "dueDate")
    labels = _validate_string_array(args, "labels")
    completed = _validate_bool(args, "completed")

    todo = _todos.get(todo_id)
    if not todo:
        return {
            "ok": False,
            "error": {"code": "TODO_NOT_FOUND", "message": f"Todo with id '{todo_id}' not found"},
        }

    updates: dict[str, Any] = {}
    if title is not None:
        updates["title"] = title
    if description is not None:
        updates["description"] = description
    if due_date is not None:
        updates["dueDate"] = due_date
    if labels is not None:
        updates["labels"] = labels
    if completed is not None:
        updates["completed"] = completed

    updated = {**todo, **updates, "updatedAt": _now_iso()}
    _todos[todo_id] = updated
    broadcast("updated", {"event": "updated", "todo": updated, "timestamp": updated["updatedAt"]})
    return {"ok": True, "result": updated}


def todos_delete(args: dict) -> dict:
    if args is None:
        args = {}
    todo_id = _validate_string(args, "id", required=True)
    todo = _todos.get(todo_id)
    if not todo:
        return {
            "ok": False,
            "error": {"code": "TODO_NOT_FOUND", "message": f"Todo with id '{todo_id}' not found"},
        }
    del _todos[todo_id]
    broadcast("deleted", {"event": "deleted", "todoId": todo_id, "timestamp": _now_iso()})
    return {"ok": True, "result": {"deleted": True}}


def todos_complete(args: dict) -> dict:
    if args is None:
        args = {}
    todo_id = _validate_string(args, "id", required=True)
    todo = _todos.get(todo_id)
    if not todo:
        return {
            "ok": False,
            "error": {"code": "TODO_NOT_FOUND", "message": f"Todo with id '{todo_id}' not found"},
        }

    if not todo.get("completed"):
        now = _now_iso()
        todo["completed"] = True
        todo["completedAt"] = now
        todo["updatedAt"] = now
        _todos[todo_id] = todo
        broadcast("completed", {"event": "completed", "todo": todo, "timestamp": now})

    return {"ok": True, "result": todo}


def todos_export(args: dict, request_id: str) -> dict:
    if args is None:
        args = {}
    fmt = _validate_enum(args, "format", ["csv", "json"], default="csv")

    instance = create_instance(request_id, "v1:todos.export")

    def _do_work():
        transition_to(request_id, "pending")

        def _finish():
            items = list(_todos.values())
            if fmt == "csv":
                header = "id,title,completed,createdAt"
                rows = [f"{t['id']},{t['title']},{str(t['completed']).lower()},{t['createdAt']}" for t in items]
                data = "\n".join([header] + rows)
            else:
                import json
                data = json.dumps(items)
            chunks = build_chunks(data)
            transition_to(request_id, "complete", {
                "result": {"format": fmt, "data": data, "count": len(items)},
                "chunks": chunks,
            })

        timer2 = threading.Timer(0.05, _finish)
        timer2.daemon = True
        timer2.start()

    timer1 = threading.Timer(0.05, _do_work)
    timer1.daemon = True
    timer1.start()

    return {"ok": True, "async": True, "requestId": instance.request_id}


def reports_generate(args: dict, request_id: str) -> dict:
    if args is None:
        args = {}
    report_type = _validate_enum(args, "type", ["summary", "detailed"], default="summary")

    instance = create_instance(request_id, "v1:reports.generate")

    def _do_work():
        transition_to(request_id, "pending")

        def _finish():
            items = list(_todos.values())
            completed_count = sum(1 for t in items if t.get("completed"))
            transition_to(request_id, "complete", {
                "result": {
                    "type": report_type,
                    "totalTodos": len(items),
                    "completedTodos": completed_count,
                    "pendingTodos": len(items) - completed_count,
                    "generatedAt": _now_iso(),
                },
            })

        timer2 = threading.Timer(0.05, _finish)
        timer2.daemon = True
        timer2.start()

    timer1 = threading.Timer(0.05, _do_work)
    timer1.daemon = True
    timer1.start()

    return {"ok": True, "async": True, "requestId": instance.request_id}


def todos_search(args: dict) -> dict:
    if args is None:
        args = {}
    query = _validate_string(args, "query", required=True)
    limit = _validate_int(args, "limit", minimum=1, maximum=100, default=20)

    items = [t for t in _todos.values() if query.lower() in t.get("title", "").lower()]
    return {
        "ok": True,
        "result": {"items": items[:limit], "cursor": None, "total": len(items)},
    }


def debug_simulate_error(args: dict) -> dict:
    if args is None:
        args = {}
    status_code = _validate_int(args, "statusCode", required=True)
    code = _validate_string(args, "code") or "SIMULATED_ERROR"
    message = _validate_string(args, "message") or "Simulated error for testing"
    raise ServerError(status_code, code, message)


def todos_watch(args: dict) -> dict:
    if args is None:
        args = {}
    _validate_enum(args, "filter", ["all", "completed", "pending"], default="all")
    session_id = str(uuid.uuid4())
    register_stream_session(session_id)
    return {"ok": True, "stream": True, "sessionId": session_id}


def todos_attach(args: dict, media_file: Optional[dict] = None) -> dict:
    if args is None:
        args = {}
    todo_id = _validate_string(args, "todoId", required=True)
    ref = _validate_string(args, "ref")

    todo = _todos.get(todo_id)
    if not todo:
        return {
            "ok": False,
            "error": {"code": "TODO_NOT_FOUND", "message": f"Todo with id '{todo_id}' not found"},
        }

    # Handle ref URI
    if ref:
        media = store_media(b"", "application/octet-stream", ref)
        todo["attachmentId"] = media.id
        todo["location"] = {"uri": f"/media/{media.id}"}
        todo["updatedAt"] = _now_iso()
        _todos[todo_id] = todo
        return {
            "ok": True,
            "result": {
                "todoId": todo_id,
                "attachmentId": media.id,
                "contentType": "application/octet-stream",
                "filename": ref,
            },
        }

    # Handle inline multipart upload
    if not media_file:
        return {
            "ok": False,
            "error": {"code": "MEDIA_REQUIRED", "message": "File upload or ref URI is required"},
        }

    # Normalize content type (strip parameters like charset)
    base_content_type = media_file["content_type"].split(";")[0].strip()
    if base_content_type not in ACCEPTED_MEDIA_TYPES:
        return {
            "ok": False,
            "error": {
                "code": "UNSUPPORTED_MEDIA_TYPE",
                "message": f"Unsupported media type: {base_content_type}. Accepted: {', '.join(ACCEPTED_MEDIA_TYPES)}",
            },
        }

    if len(media_file["data"]) > MAX_MEDIA_BYTES:
        return {
            "ok": False,
            "error": {"code": "MEDIA_TOO_LARGE", "message": f"File exceeds maximum size of {MAX_MEDIA_BYTES} bytes"},
        }

    media = store_media(media_file["data"], base_content_type, media_file["filename"])
    todo["attachmentId"] = media.id
    todo["location"] = {"uri": f"/media/{media.id}"}
    todo["updatedAt"] = _now_iso()
    _todos[todo_id] = todo

    return {
        "ok": True,
        "result": {
            "todoId": todo_id,
            "attachmentId": media.id,
            "contentType": media_file["content_type"],
            "filename": media_file["filename"],
        },
    }


# ---------------------------------------------------------------------------
# Operations registry (handler dispatch table)
# ---------------------------------------------------------------------------

OPERATIONS: dict[str, dict[str, Any]] = {
    "v1:todos.create": {
        "handler": todos_create,
        "side_effecting": True,
        "auth_scopes": ["todos:write"],
        "execution_model": "sync",
    },
    "v1:todos.get": {
        "handler": todos_get,
        "side_effecting": False,
        "auth_scopes": ["todos:read"],
        "execution_model": "sync",
    },
    "v1:todos.list": {
        "handler": todos_list,
        "side_effecting": False,
        "auth_scopes": ["todos:read"],
        "execution_model": "sync",
    },
    "v1:todos.update": {
        "handler": todos_update,
        "side_effecting": True,
        "auth_scopes": ["todos:write"],
        "execution_model": "sync",
    },
    "v1:todos.delete": {
        "handler": todos_delete,
        "side_effecting": True,
        "auth_scopes": ["todos:write"],
        "execution_model": "sync",
    },
    "v1:todos.complete": {
        "handler": todos_complete,
        "side_effecting": True,
        "auth_scopes": ["todos:write"],
        "execution_model": "sync",
    },
    "v1:todos.export": {
        "async_handler": todos_export,
        "side_effecting": False,
        "auth_scopes": ["todos:read"],
        "execution_model": "async",
    },
    "v1:reports.generate": {
        "async_handler": reports_generate,
        "side_effecting": False,
        "auth_scopes": ["reports:read"],
        "execution_model": "async",
    },
    "v1:todos.search": {
        "handler": todos_search,
        "side_effecting": False,
        "auth_scopes": ["todos:read"],
        "execution_model": "sync",
        "deprecated": True,
        "sunset": "2025-01-01",
        "replacement": "v1:todos.list",
    },
    "v1:debug.simulateError": {
        "handler": debug_simulate_error,
        "side_effecting": False,
        "auth_scopes": [],
        "execution_model": "sync",
    },
    "v1:todos.attach": {
        "handler": todos_attach,
        "side_effecting": True,
        "auth_scopes": ["todos:write"],
        "execution_model": "sync",
        "accepts_media": True,
    },
    "v1:todos.watch": {
        "stream_handler": todos_watch,
        "side_effecting": False,
        "auth_scopes": ["todos:read"],
        "execution_model": "stream",
    },
}
