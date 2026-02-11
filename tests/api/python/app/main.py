"""
FastAPI application for the OpenCALL Todo API.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import uuid
import base64
from typing import Optional

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, Response, RedirectResponse

from .registry import build_registry
from .router import handle_call
from .operations import (
    reset_storage,
    get_stream_session,
    set_broadcast_fn,
    reset_stream_sessions,
)
from .auth import register_token, reset_token_store
from .state import get_instance, reset_instances
from .media import get_media, reset_media


app = FastAPI()

# ---------------------------------------------------------------------------
# Registry (computed once at startup)
# ---------------------------------------------------------------------------
_registry: dict = {}
_registry_json: str = ""
_registry_etag: str = ""


def _init_registry() -> None:
    global _registry, _registry_json, _registry_etag
    _registry = build_registry()
    _registry_json = json.dumps(_registry, separators=(",", ":"))
    h = hashlib.sha256(_registry_json.encode()).hexdigest()
    _registry_etag = f'"{h}"'


# ---------------------------------------------------------------------------
# WebSocket connection manager
# ---------------------------------------------------------------------------
_active_websockets: set[WebSocket] = set()
_event_loop: Optional[asyncio.AbstractEventLoop] = None


def _broadcast(event: str, data: dict) -> None:
    """Broadcast to all active WebSocket connections."""
    if not _active_websockets:
        return
    message = json.dumps(data)
    dead: list[WebSocket] = []
    for ws in list(_active_websockets):
        try:
            if _event_loop is not None and _event_loop.is_running():
                _event_loop.create_task(ws.send_text(message))
            else:
                # Try to get the current running loop
                try:
                    loop = asyncio.get_running_loop()
                    loop.create_task(ws.send_text(message))
                except RuntimeError:
                    dead.append(ws)
        except Exception:
            dead.append(ws)
    for ws in dead:
        _active_websockets.discard(ws)


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------

@app.on_event("startup")
async def startup() -> None:
    global _event_loop
    _event_loop = asyncio.get_running_loop()
    reset_storage()
    reset_token_store()
    reset_instances()
    reset_media()
    reset_stream_sessions()
    _init_registry()
    set_broadcast_fn(_broadcast)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/.well-known/ops")
async def well_known_ops(request: Request) -> Response:
    if_none_match = request.headers.get("if-none-match")
    if if_none_match == _registry_etag:
        return Response(status_code=304)
    return Response(
        content=_registry_json,
        status_code=200,
        media_type="application/json",
        headers={
            "Cache-Control": "public, max-age=3600",
            "ETag": _registry_etag,
        },
    )


@app.get("/call")
async def get_call_not_allowed() -> JSONResponse:
    return JSONResponse(
        status_code=405,
        content={
            "requestId": str(uuid.uuid4()),
            "state": "error",
            "error": {
                "code": "METHOD_NOT_ALLOWED",
                "message": "Use POST /call to invoke operations. Discover available operations at GET /.well-known/ops",
            },
        },
        headers={"Allow": "POST"},
    )


@app.post("/call")
async def call_endpoint(request: Request) -> JSONResponse:
    content_type = request.headers.get("content-type", "")
    envelope = None
    media_file = None

    if "multipart/form-data" in content_type:
        try:
            form = await request.form()
            envelope_part = form.get("envelope")
            if envelope_part is None:
                return JSONResponse(
                    status_code=400,
                    content={
                        "requestId": str(uuid.uuid4()),
                        "state": "error",
                        "error": {
                            "code": "INVALID_REQUEST",
                            "message": "Missing envelope part in multipart request",
                        },
                    },
                )
            if hasattr(envelope_part, "read"):
                # It's an UploadFile
                raw = await envelope_part.read()
                envelope = json.loads(raw)
            else:
                envelope = json.loads(str(envelope_part))

            file_part = form.get("file")
            if file_part is not None and hasattr(file_part, "read"):
                data = await file_part.read()
                media_file = {
                    "data": data,
                    "content_type": file_part.content_type or "application/octet-stream",
                    "filename": file_part.filename or "upload",
                }
        except json.JSONDecodeError:
            return JSONResponse(
                status_code=400,
                content={
                    "requestId": str(uuid.uuid4()),
                    "state": "error",
                    "error": {
                        "code": "INVALID_REQUEST",
                        "message": "Invalid multipart request",
                    },
                },
            )
        except Exception:
            return JSONResponse(
                status_code=400,
                content={
                    "requestId": str(uuid.uuid4()),
                    "state": "error",
                    "error": {
                        "code": "INVALID_REQUEST",
                        "message": "Invalid multipart request",
                    },
                },
            )
    else:
        try:
            body = await request.body()
            envelope = json.loads(body)
        except (json.JSONDecodeError, Exception):
            return JSONResponse(
                status_code=400,
                content={
                    "requestId": str(uuid.uuid4()),
                    "state": "error",
                    "error": {
                        "code": "INVALID_REQUEST",
                        "message": "Invalid JSON in request body",
                    },
                },
            )

    auth_header = request.headers.get("authorization")
    result = handle_call(envelope, auth_header, media_file)
    return JSONResponse(status_code=result["status"], content=result["body"])


@app.get("/ops/{request_id}/chunks")
async def get_chunks(request_id: str, request: Request) -> JSONResponse:
    instance = get_instance(request_id)
    if instance is None:
        return JSONResponse(
            status_code=404,
            content={
                "requestId": request_id,
                "state": "error",
                "error": {
                    "code": "NOT_FOUND",
                    "message": f"Operation {request_id} not found",
                },
            },
        )

    if instance.state != "complete" or not instance.chunks or len(instance.chunks) == 0:
        return JSONResponse(
            status_code=400,
            content={
                "requestId": request_id,
                "state": "error",
                "error": {
                    "code": "NOT_READY",
                    "message": "Operation not yet complete or has no chunks",
                },
            },
        )

    cursor_param = request.query_params.get("cursor")
    chunk_index = 0
    if cursor_param:
        try:
            offset = int(base64.b64decode(cursor_param).decode())
            found = False
            for i, c in enumerate(instance.chunks):
                if c.offset == offset:
                    chunk_index = i
                    found = True
                    break
            if not found:
                chunk_index = 0
        except Exception:
            chunk_index = 0

    chunk = instance.chunks[chunk_index]
    return JSONResponse(
        status_code=200,
        content={
            "requestId": request_id,
            "chunk": chunk.to_dict(),
        },
    )


@app.get("/ops/{request_id}")
async def poll_operation(request_id: str) -> JSONResponse:
    instance = get_instance(request_id)
    if instance is None:
        return JSONResponse(
            status_code=404,
            content={
                "requestId": request_id,
                "state": "error",
                "error": {
                    "code": "NOT_FOUND",
                    "message": f"Operation {request_id} not found",
                },
            },
        )

    body: dict = {
        "requestId": instance.request_id,
        "state": instance.state,
    }
    if instance.state == "complete" and instance.result is not None:
        body["result"] = instance.result
    if instance.state == "error" and instance.error:
        body["error"] = instance.error
    if instance.state in ("accepted", "pending"):
        body["retryAfterMs"] = instance.retry_after_ms
    body["expiresAt"] = instance.expires_at

    return JSONResponse(status_code=200, content=body)


@app.get("/media/{media_id}/data")
async def media_data(media_id: str) -> Response:
    media = get_media(media_id)
    if media is None:
        return JSONResponse(
            status_code=404,
            content={
                "requestId": str(uuid.uuid4()),
                "state": "error",
                "error": {"code": "NOT_FOUND", "message": "Media not found"},
            },
        )
    return Response(
        content=media.data,
        status_code=200,
        media_type=media.content_type,
        headers={
            "Content-Disposition": f'attachment; filename="{media.filename}"',
        },
    )


@app.get("/media/{media_id}")
async def media_redirect(media_id: str) -> Response:
    media = get_media(media_id)
    if media is None:
        return JSONResponse(
            status_code=404,
            content={
                "requestId": str(uuid.uuid4()),
                "state": "error",
                "error": {"code": "NOT_FOUND", "message": "Media not found"},
            },
        )
    return Response(
        status_code=303,
        headers={"Location": f"/media/{media_id}/data"},
    )


@app.post("/_internal/tokens")
async def internal_tokens(request: Request) -> JSONResponse:
    body = await request.json()
    register_token(body["token"], body["scopes"])
    return JSONResponse(status_code=200, content={"ok": True})


@app.websocket("/streams/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str) -> None:
    session = get_stream_session(session_id)
    if session is None:
        await websocket.close(code=4004, reason="Stream session not found")
        return

    await websocket.accept()
    _active_websockets.add(websocket)
    try:
        while True:
            # Keep connection alive; we don't expect inbound messages
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        _active_websockets.discard(websocket)
