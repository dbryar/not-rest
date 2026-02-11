"""
In-memory media storage for the OpenCALL Todo API.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Optional


ACCEPTED_MEDIA_TYPES = ["image/png", "image/jpeg", "application/pdf", "text/plain"]
MAX_MEDIA_BYTES = 10 * 1024 * 1024  # 10 MB


@dataclass
class StoredMedia:
    id: str
    data: bytes
    content_type: str
    filename: str


_media_store: dict[str, StoredMedia] = {}


def store_media(data: bytes, content_type: str, filename: str) -> StoredMedia:
    media_id = str(uuid.uuid4())
    media = StoredMedia(id=media_id, data=data, content_type=content_type, filename=filename)
    _media_store[media_id] = media
    return media


def get_media(media_id: str) -> Optional[StoredMedia]:
    return _media_store.get(media_id)


def reset_media() -> None:
    _media_store.clear()
