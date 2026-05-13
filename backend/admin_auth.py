from __future__ import annotations

import hmac
import os
from typing import Annotated, Callable, Literal

from fastapi import Header, HTTPException

AdminAccessLevel = Literal["viewer", "editor", "admin"]
MinimumAccessLevel = Literal["read", "write", "viewer", "editor", "admin"]

ROLE_RANK: dict[AdminAccessLevel, int] = {
    "viewer": 10,
    "editor": 20,
    "admin": 30,
}

ROLE_CAPABILITIES: dict[AdminAccessLevel, tuple[str, ...]] = {
    "viewer": ("read",),
    "editor": ("read", "write"),
    "admin": ("read", "write", "delete", "audit"),
}


def require_admin_token(
    x_admin_token: Annotated[str | None, Header(alias="x-admin-token")] = None,
    authorization: Annotated[str | None, Header()] = None,
) -> AdminAccessLevel:
    return require_admin_access_level("editor", x_admin_token, authorization)


def require_admin_access(minimum_access: MinimumAccessLevel = "read") -> Callable[..., AdminAccessLevel]:
    def dependency(
        x_admin_token: Annotated[str | None, Header(alias="x-admin-token")] = None,
        authorization: Annotated[str | None, Header()] = None,
    ) -> AdminAccessLevel:
        return require_admin_access_level(minimum_access, x_admin_token, authorization)

    return dependency


def require_admin_access_level(
    minimum_access: MinimumAccessLevel,
    x_admin_token: str | None,
    authorization: str | None,
) -> AdminAccessLevel:
    if not has_configured_token(minimum_access):
        raise HTTPException(status_code=503, detail="admin token is not configured")

    access_level = resolve_admin_access_level(x_admin_token, authorization)
    if access_level is None or not role_meets_requirement(access_level, minimum_access):
        raise HTTPException(status_code=401, detail="unauthorized")
    return access_level


def resolve_admin_access_level(
    x_admin_token: str | None,
    authorization: str | None,
) -> AdminAccessLevel | None:
    provided_token = extract_admin_token(x_admin_token, authorization)
    if not provided_token:
        return None

    for role, token in configured_role_tokens():
        if hmac.compare_digest(provided_token, token):
            return role
    return None


def has_configured_token(minimum_access: MinimumAccessLevel) -> bool:
    return any(role_meets_requirement(role, minimum_access) for role, _token in configured_role_tokens())


def configured_role_tokens() -> list[tuple[AdminAccessLevel, str]]:
    candidates: list[tuple[AdminAccessLevel, str]] = [
        ("admin", os.getenv("ADMIN_ADMIN_TOKEN", "").strip()),
        ("admin", os.getenv("ADMIN_TOKEN", "").strip()),
        ("editor", os.getenv("ADMIN_EDITOR_TOKEN", "").strip()),
        ("viewer", os.getenv("ADMIN_VIEWER_TOKEN", "").strip()),
        ("viewer", os.getenv("ADMIN_VIEW_TOKEN", "").strip()),
    ]
    return [(role, token) for role, token in candidates if token]


def role_meets_requirement(role: AdminAccessLevel, minimum_access: MinimumAccessLevel) -> bool:
    required_role = minimum_role_for_access(minimum_access)
    return ROLE_RANK[role] >= ROLE_RANK[required_role]


def minimum_role_for_access(minimum_access: MinimumAccessLevel) -> AdminAccessLevel:
    if minimum_access in {"read", "viewer"}:
        return "viewer"
    if minimum_access in {"write", "editor"}:
        return "editor"
    return "admin"


def role_access_level(role: AdminAccessLevel) -> Literal["read", "write"]:
    return "read" if role == "viewer" else "write"


def role_capabilities(role: AdminAccessLevel) -> list[str]:
    return list(ROLE_CAPABILITIES[role])


def extract_admin_token(
    x_admin_token: str | None,
    authorization: str | None,
) -> str | None:
    if x_admin_token and x_admin_token.strip():
        return x_admin_token.strip()

    if not authorization:
        return None

    parts = authorization.strip().split(maxsplit=1)
    if len(parts) != 2:
        return None

    scheme, token = parts
    if scheme.lower() != "bearer" or not token.strip():
        return None

    return token.strip()
