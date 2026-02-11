"""
Operation instance state machine with chunked retrieval support.
"""

from __future__ import annotations

import hashlib
import base64
import time
from typing import Optional, Any


class Chunk:
    __slots__ = ("offset", "data", "checksum", "checksum_previous", "state", "cursor")

    def __init__(
        self,
        offset: int,
        data: str,
        checksum: str,
        checksum_previous: Optional[str],
        state: str,  # "partial" | "complete"
        cursor: Optional[str],
    ):
        self.offset = offset
        self.data = data
        self.checksum = checksum
        self.checksum_previous = checksum_previous
        self.state = state
        self.cursor = cursor

    def to_dict(self) -> dict:
        return {
            "offset": self.offset,
            "data": self.data,
            "checksum": self.checksum,
            "checksumPrevious": self.checksum_previous,
            "state": self.state,
            "cursor": self.cursor,
        }


class OperationInstance:
    __slots__ = (
        "request_id", "op", "state", "result", "error",
        "retry_after_ms", "created_at", "expires_at", "chunks",
    )

    def __init__(self, request_id: str, op: str):
        self.request_id = request_id
        self.op = op
        self.state = "accepted"
        self.result: Any = None
        self.error: Optional[dict] = None
        self.retry_after_ms = 100
        self.created_at = int(time.time())
        self.expires_at = int(time.time()) + 3600
        self.chunks: Optional[list[Chunk]] = None


# In-memory store
_instances: dict[str, OperationInstance] = {}


def create_instance(request_id: str, op: str) -> OperationInstance:
    instance = OperationInstance(request_id, op)
    _instances[request_id] = instance
    return instance


def transition_to(
    request_id: str,
    state: str,
    data: Optional[dict] = None,
) -> Optional[OperationInstance]:
    instance = _instances.get(request_id)
    if instance is None:
        return None
    instance.state = state
    if data:
        if "result" in data:
            instance.result = data["result"]
        if "error" in data:
            instance.error = data["error"]
        if "chunks" in data:
            instance.chunks = data["chunks"]
    return instance


def get_instance(request_id: str) -> Optional[OperationInstance]:
    return _instances.get(request_id)


def reset_instances() -> None:
    _instances.clear()


def compute_sha256(data: str) -> str:
    h = hashlib.sha256(data.encode("utf-8")).hexdigest()
    return f"sha256:{h}"


def build_chunks(data: str, chunk_size: int = 512) -> list[Chunk]:
    chunks: list[Chunk] = []
    offset = 0
    previous_checksum: Optional[str] = None

    while offset < len(data):
        end = min(offset + chunk_size, len(data))
        chunk_data = data[offset:end]
        checksum = compute_sha256(chunk_data)
        is_last = end >= len(data)
        cursor = None if is_last else base64.b64encode(str(end).encode()).decode()

        chunks.append(
            Chunk(
                offset=offset,
                data=chunk_data,
                checksum=checksum,
                checksum_previous=previous_checksum,
                state="complete" if is_last else "partial",
                cursor=cursor,
            )
        )

        previous_checksum = checksum
        offset = end

    return chunks
