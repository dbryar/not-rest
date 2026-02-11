"""
Envelope dispatch for the OpenCALL Todo API.
"""

from __future__ import annotations

import time
import uuid
from datetime import datetime
from typing import Any, Optional

from .operations import OPERATIONS, get_idempotency_store, ValidationError, ServerError


def handle_call(
    envelope: dict,
    auth_header: Optional[str] = None,
    media_file: Optional[dict] = None,
) -> dict:
    """
    Process a /call request envelope and return {"status": int, "body": dict}.
    """
    from .auth import validate_auth

    ctx = envelope.get("ctx") or {}
    request_id = ctx.get("requestId") or str(uuid.uuid4())
    session_id = ctx.get("sessionId")

    base: dict[str, Any] = {"requestId": request_id}
    if session_id:
        base["sessionId"] = session_id

    # Validate op is present and a string
    op = envelope.get("op")
    if not op or not isinstance(op, str):
        return {
            "status": 400,
            "body": {
                **base,
                "state": "error",
                "error": {
                    "code": "INVALID_REQUEST",
                    "message": "Missing or invalid 'op' field",
                },
            },
        }

    # Look up operation
    operation = OPERATIONS.get(op)
    if operation is None:
        return {
            "status": 400,
            "body": {
                **base,
                "state": "error",
                "error": {
                    "code": "UNKNOWN_OP",
                    "message": f"Unknown operation: {op}",
                },
            },
        }

    # Deprecated check -- past sunset date means 410
    if operation.get("deprecated") and operation.get("sunset"):
        sunset_date = datetime.fromisoformat(operation["sunset"])
        if datetime.now() > sunset_date:
            return {
                "status": 410,
                "body": {
                    **base,
                    "state": "error",
                    "error": {
                        "code": "OP_REMOVED",
                        "message": f"Operation {op} has been removed",
                        "cause": {
                            "removedOp": op,
                            "replacement": operation.get("replacement"),
                        },
                    },
                },
            }

    # Auth check
    auth_scopes = operation.get("auth_scopes", [])
    if auth_scopes:
        auth_result = validate_auth(auth_header, auth_scopes)
        if not auth_result["valid"]:
            return {
                "status": auth_result["status"],
                "body": {
                    **base,
                    "state": "error",
                    "error": {
                        "code": auth_result["code"],
                        "message": auth_result["message"],
                    },
                },
            }

    # Idempotency check for side-effecting ops
    idempotency_key = ctx.get("idempotencyKey")
    if operation.get("side_effecting") and idempotency_key:
        store = get_idempotency_store()
        cached = store.get(idempotency_key)
        if cached is not None:
            return cached

    # Execute handler
    args = envelope.get("args") or {}

    try:
        # Stream operations
        if operation.get("execution_model") == "stream" and "stream_handler" in operation:
            stream_result = operation["stream_handler"](args)
            if not stream_result.get("ok"):
                return {
                    "status": 200,
                    "body": {**base, "state": "error", "error": stream_result["error"]},
                }
            return {
                "status": 202,
                "body": {
                    **base,
                    "state": "streaming",
                    "stream": {
                        "transport": "wss",
                        "location": f"/streams/{stream_result['sessionId']}",
                        "sessionId": stream_result["sessionId"],
                        "encoding": "json",
                        "expiresAt": int(time.time()) + 3600,
                    },
                },
            }

        # Async operations
        if operation.get("execution_model") == "async" and "async_handler" in operation:
            async_result = operation["async_handler"](args, request_id)
            if not async_result.get("ok"):
                return {
                    "status": 200,
                    "body": {**base, "state": "error", "error": async_result["error"]},
                }
            return {
                "status": 202,
                "body": {
                    **base,
                    "state": "accepted",
                    "retryAfterMs": 100,
                    "expiresAt": int(time.time()) + 3600,
                },
            }

        # Sync operations
        handler = operation["handler"]
        if operation.get("accepts_media"):
            result = handler(args, media_file)
        else:
            result = handler(args)

        if result["ok"]:
            response = {
                "status": 200,
                "body": {**base, "state": "complete", "result": result["result"]},
            }
        else:
            # Domain error -- HTTP 200
            response = {
                "status": 200,
                "body": {**base, "state": "error", "error": result["error"]},
            }

        # Store for idempotency
        if operation.get("side_effecting") and idempotency_key:
            get_idempotency_store()[idempotency_key] = response

        return response

    except ValidationError as err:
        return {
            "status": 400,
            "body": {
                **base,
                "state": "error",
                "error": {
                    "code": "VALIDATION_ERROR",
                    "message": err.message,
                },
            },
        }

    except ServerError as err:
        return {
            "status": err.status_code,
            "body": {
                **base,
                "state": "error",
                "error": {
                    "code": err.code,
                    "message": err.message,
                },
            },
        }

    except Exception as err:
        return {
            "status": 500,
            "body": {
                **base,
                "state": "error",
                "error": {
                    "code": "INTERNAL_ERROR",
                    "message": str(err) if str(err) else "Unknown error",
                },
            },
        }
