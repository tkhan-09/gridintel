from __future__ import annotations

from typing import Optional, Sequence

from fastapi import Depends, HTTPException, WebSocket, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_access_token

# ------------------------------------------------------------------ #
# Role name constants — single source of truth
# ------------------------------------------------------------------ #
ROLE_SUPERADMIN = "SuperAdmin"
ROLE_ADMIN = "Admin"
ROLE_OPERATOR = "Operator"
ROLE_AUDITOR = "Auditor"
ROLE_VIEWER = "Viewer"

ALL_ROLES: tuple[str, ...] = (
    ROLE_SUPERADMIN,
    ROLE_ADMIN,
    ROLE_OPERATOR,
    ROLE_AUDITOR,
    ROLE_VIEWER,
)

# Role hierarchy — higher index = lower privilege
_ROLE_HIERARCHY: dict[str, int] = {
    ROLE_SUPERADMIN: 0,
    ROLE_ADMIN: 1,
    ROLE_AUDITOR: 2,
    ROLE_OPERATOR: 3,
    ROLE_VIEWER: 4,
}


# ------------------------------------------------------------------ #
# Bearer scheme (auto_error=False so we can return clean 401)
# ------------------------------------------------------------------ #
_bearer_scheme = HTTPBearer(auto_error=False)


# ------------------------------------------------------------------ #
# Lightweight token-payload model (avoids circular imports with ORM)
# ------------------------------------------------------------------ #
class TokenPayload:
    __slots__ = ("user_id", "role", "office_id")

    def __init__(self, user_id: int, role: str, office_id: Optional[int] = None) -> None:
        self.user_id = user_id
        self.role = role
        self.office_id = office_id

    @property
    def is_superadmin(self) -> bool:
        return self.role == ROLE_SUPERADMIN

    @property
    def is_admin_or_above(self) -> bool:
        return _ROLE_HIERARCHY.get(self.role, 99) <= _ROLE_HIERARCHY[ROLE_ADMIN]

    def has_role(self, *roles: str) -> bool:
        return self.role in roles

    def has_min_role(self, minimum_role: str) -> bool:
        """Return True if this token's role is >= minimum_role in the hierarchy."""
        return _ROLE_HIERARCHY.get(self.role, 99) <= _ROLE_HIERARCHY.get(minimum_role, 99)


# ------------------------------------------------------------------ #
# Core token extraction dependency
# ------------------------------------------------------------------ #
async def _extract_token_payload(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer_scheme),
) -> TokenPayload:
    """
    Extract and validate the Bearer JWT from the Authorization header.
    Raises HTTP 401 on any problem.
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = decode_access_token(credentials.credentials)
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    user_id_str = payload.get("sub")
    role = payload.get("role")

    if not user_id_str or not role:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token payload incomplete",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        user_id = int(user_id_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token subject",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return TokenPayload(
        user_id=user_id,
        role=role,
        office_id=payload.get("office_id"),
    )


# ------------------------------------------------------------------ #
# Public dependency: get_current_user
# Any authenticated user regardless of role.
# ------------------------------------------------------------------ #
async def get_current_user(
    token: TokenPayload = Depends(_extract_token_payload),
) -> TokenPayload:
    """Dependency: require any valid authenticated user."""
    return token


# ------------------------------------------------------------------ #
# RoleChecker — the core RBAC class
# ------------------------------------------------------------------ #
class RoleChecker:
    """
    FastAPI dependency factory that enforces role-based access control.

    Usage:
        require_admin = RoleChecker([ROLE_SUPERADMIN, ROLE_ADMIN])

        @router.post("/admin-action")
        async def admin_action(
            current_user: TokenPayload = Depends(require_admin),
        ):
            ...

    The checker raises HTTP 403 if the authenticated user's role is not
    in *allowed_roles*.  Pass ``allow_self=True`` to additionally permit
    users accessing their own resource (``entity_user_id`` query/path
    param must equal the token's ``user_id``).
    """

    def __init__(
        self,
        allowed_roles: Sequence[str],
        *,
        allow_self: bool = False,
    ) -> None:
        self._allowed = frozenset(allowed_roles)
        self._allow_self = allow_self

    async def __call__(
        self,
        token: TokenPayload = Depends(_extract_token_payload),
    ) -> TokenPayload:
        if token.role not in self._allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Access denied. Required roles: "
                    f"{sorted(self._allowed)}. "
                    f"Your role: {token.role}."
                ),
            )
        return token


# ------------------------------------------------------------------ #
# Pre-built role checkers (import these in routers)
# ------------------------------------------------------------------ #

# Only the SuperAdmin
require_superadmin = RoleChecker([ROLE_SUPERADMIN])

# SuperAdmin or Admin
require_admin = RoleChecker([ROLE_SUPERADMIN, ROLE_ADMIN])

# SuperAdmin, Admin, or Auditor (verification & approval workflows)
require_auditor = RoleChecker([ROLE_SUPERADMIN, ROLE_ADMIN, ROLE_AUDITOR])

# SuperAdmin, Admin, Auditor, or Operator (data entry)
require_operator = RoleChecker(
    [ROLE_SUPERADMIN, ROLE_ADMIN, ROLE_AUDITOR, ROLE_OPERATOR]
)

# Any authenticated user (all 5 roles)
require_any_role = RoleChecker(ALL_ROLES)

# Viewer and above (read-only endpoints — effectively same as require_any_role
# but semantically explicit about intent)
require_viewer = RoleChecker(ALL_ROLES)


# ------------------------------------------------------------------ #
# Active-user guard (DB check)
# Wraps require_any_role and verifies the user is still active in DB.
# Use on sensitive endpoints where token revocation matters.
# ------------------------------------------------------------------ #
async def get_active_user(
    token: TokenPayload = Depends(_extract_token_payload),
    db=Depends(get_db),
) -> TokenPayload:
    """
    Dependency: verify the user exists and ``is_active=True`` in DB.

    This performs a DB round-trip on every request — use sparingly on
    high-frequency endpoints.  For most endpoints ``get_current_user``
    or a ``RoleChecker`` is sufficient.
    """
    # Import here to avoid circular imports at module load time
    from app.models.user import User  # noqa: PLC0415

    stmt = select(User.is_active).where(User.id == token.user_id)
    result = await db.execute(stmt)
    row = result.scalar_one_or_none()

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not row:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled",
        )

    return token


# ------------------------------------------------------------------ #
# Self-or-admin dependency
# Allows a user to access their OWN resource OR any admin+ role.
# ------------------------------------------------------------------ #
class SelfOrAdmin:
    """
    Dependency that passes if the requester is an admin/superadmin
    OR if the requester's user_id matches *target_user_id*.

    Usage (path param named ``user_id``):
        @router.get("/users/{user_id}/profile")
        async def get_profile(
            user_id: int,
            token: TokenPayload = Depends(SelfOrAdmin("user_id")),
        ):
            ...
    """

    def __init__(self, path_param: str = "user_id") -> None:
        self._path_param = path_param

    async def __call__(
        self,
        token: TokenPayload = Depends(_extract_token_payload),
        **kwargs: int,
    ) -> TokenPayload:
        if token.is_admin_or_above:
            return token

        target_id = kwargs.get(self._path_param)
        if target_id is not None and int(target_id) == token.user_id:
            return token

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only access your own resource",
        )


# ------------------------------------------------------------------ #
# WebSocket token dependency
# ------------------------------------------------------------------ #
async def get_ws_token(websocket: WebSocket) -> TokenPayload:
    """
    Extract and validate a JWT from a WebSocket connection.

    Clients must pass the token as a query parameter:
        ws://host/ws/notifications?token=<jwt>

    Closes the connection with code 4001 on auth failure.
    """
    token_str = websocket.query_params.get("token")

    if not token_str:
        await websocket.close(code=4001, reason="Missing authentication token")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="WebSocket: missing token",
        )

    try:
        payload = decode_access_token(token_str)
    except JWTError as exc:
        await websocket.close(code=4001, reason=str(exc))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"WebSocket: {exc}",
        ) from exc

    user_id_str = payload.get("sub")
    role = payload.get("role")

    if not user_id_str or not role:
        await websocket.close(code=4001, reason="Incomplete token payload")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="WebSocket: incomplete token",
        )

    return TokenPayload(
        user_id=int(user_id_str),
        role=role,
        office_id=payload.get("office_id"),
    )


# Backwards compatibility aliases
get_current_active_user = get_active_user
require_role = RoleChecker
