"""
Token store and auth validation for the OpenCALL Todo API.
"""

from __future__ import annotations

from typing import Union

# token -> list of scopes
token_store: dict[str, list[str]] = {}


def register_token(token: str, scopes: list[str]) -> None:
    token_store[token] = scopes


def reset_token_store() -> None:
    token_store.clear()


def validate_auth(
    auth_header: str | None,
    required_scopes: list[str],
) -> Union[
    dict,  # {"valid": True} or {"valid": False, "status": int, "code": str, "message": str}
]:
    if not required_scopes:
        return {"valid": True}

    if not auth_header or not auth_header.startswith("Bearer "):
        return {
            "valid": False,
            "status": 401,
            "code": "AUTH_REQUIRED",
            "message": "Authorization header with Bearer token is required",
        }

    token = auth_header[7:]
    entry = token_store.get(token)

    if entry is None:
        return {
            "valid": False,
            "status": 401,
            "code": "AUTH_REQUIRED",
            "message": "Invalid or expired token",
        }

    has_all_scopes = all(scope in entry for scope in required_scopes)
    if not has_all_scopes:
        return {
            "valid": False,
            "status": 403,
            "code": "INSUFFICIENT_SCOPE",
            "message": f"Token lacks required scopes: {', '.join(required_scopes)}",
        }

    return {"valid": True}
