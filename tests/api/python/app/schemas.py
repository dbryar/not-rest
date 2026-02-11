"""
Data models for the OpenCALL Todo API.
Uses plain dicts — no Pydantic models for route-level validation.
"""

from __future__ import annotations

from typing import TypedDict, Optional


class LocationAuthDict(TypedDict, total=False):
    credentialType: str
    credential: str
    expiresAt: Optional[int]


class LocationDict(TypedDict, total=False):
    uri: str
    auth: Optional[LocationAuthDict]


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
