"""
Data models for the OpenCALL Todo API.
Uses plain dicts — no Pydantic models for route-level validation.
"""

from __future__ import annotations

from typing import TypedDict, Optional


class LocationDict(TypedDict, total=False):
    uri: str
    method: str
    headers: dict[str, str]


class TodoDict(TypedDict, total=False):
    id: str
    title: str
    description: Optional[str]
    dueDate: Optional[str]
    labels: Optional[list[str]]
    completed: bool
    completedAt: Optional[str]
    createdAt: str
    updatedAt: str
    attachmentId: Optional[str]
    location: Optional[LocationDict]
