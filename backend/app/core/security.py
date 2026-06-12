from __future__ import annotations

import secrets
import string
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

# ------------------------------------------------------------------ #
# Password hashing context
# ------------------------------------------------------------------ #
_pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
    bcrypt__rounds=settings.BCRYPT_ROUNDS,
)


def hash_password(plain_password: str) -> str:
    """Return a bcrypt hash of *plain_password*."""
    return _pwd_context.hash(plain_password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Return True if *plain_password* matches *hashed_password*."""
    return _pwd_context.verify(plain_password, hashed_password)


def needs_rehash(hashed_password: str) -> bool:
    """
    Return True if the stored hash was produced with outdated parameters
    (e.g. old bcrypt rounds) and should be rehashed on next login.
    """
    return _pwd_context.needs_update(hashed_password)


# ------------------------------------------------------------------ #
# JWT helpers
# ------------------------------------------------------------------ #
_ACCESS_TOKEN_TYPE = "access"
_REFRESH_TOKEN_TYPE = "refresh"


def _utc_now() -> datetime:
    return datetime.now(tz=timezone.utc)


def create_access_token(
    subject: int | str,
    *,
    role: str,
    extra_claims: Optional[dict[str, Any]] = None,
) -> str:
    """
    Create a short-lived JWT access token.

    Args:
        subject:      The user's primary key (stored as ``sub``).
        role:         The user's role name (stored as ``role``).
        extra_claims: Optional additional claims merged into the payload.

    Returns:
        Signed JWT string.
    """
    now = _utc_now()
    expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    payload: dict[str, Any] = {
        "sub": str(subject),
        "role": role,
        "type": _ACCESS_TOKEN_TYPE,
        "iat": now,
        "exp": expire,
        "nbf": now,
    }
    if extra_claims:
        payload.update(extra_claims)

    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(subject: int | str) -> str:
    """
    Create a long-lived JWT refresh token.

    Refresh tokens contain only ``sub`` and ``type`` to minimise
    payload size and limit blast radius if leaked.
    """
    now = _utc_now()
    expire = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

    payload: dict[str, Any] = {
        "sub": str(subject),
        "type": _REFRESH_TOKEN_TYPE,
        "iat": now,
        "exp": expire,
        "nbf": now,
    }

    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any]:
    """
    Decode and validate an access token.

    Raises:
        JWTError: if the token is invalid, expired, or of wrong type.

    Returns:
        The decoded payload dict.
    """
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
        )
    except JWTError as exc:
        raise JWTError(f"Invalid access token: {exc}") from exc

    if payload.get("type") != _ACCESS_TOKEN_TYPE:
        raise JWTError("Token type mismatch: expected access token")

    return payload


def decode_refresh_token(token: str) -> dict[str, Any]:
    """
    Decode and validate a refresh token.

    Raises:
        JWTError: if the token is invalid, expired, or of wrong type.

    Returns:
        The decoded payload dict.
    """
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
        )
    except JWTError as exc:
        raise JWTError(f"Invalid refresh token: {exc}") from exc

    if payload.get("type") != _REFRESH_TOKEN_TYPE:
        raise JWTError("Token type mismatch: expected refresh token")

    return payload


def get_subject_from_token(token: str) -> str:
    """
    Convenience helper — returns the ``sub`` claim from an access token
    without re-raising a wrapped JWTError.

    Raises:
        JWTError on any problem.
    """
    payload = decode_access_token(token)
    sub = payload.get("sub")
    if not sub:
        raise JWTError("Token missing 'sub' claim")
    return sub


# ------------------------------------------------------------------ #
# Password Reset Token
# ------------------------------------------------------------------ #
_RESET_ALPHABET = string.ascii_letters + string.digits


def generate_password_reset_token(*, nbytes: int = 48) -> str:
    """
    Generate a cryptographically secure URL-safe password reset token.

    The token is a random hex string long enough to be brute-force
    resistant.  It is stored (hashed) in the DB alongside an expiry
    timestamp; the plain token is sent to the user via email.

    Args:
        nbytes: Entropy bytes.  Default 48 → 96-char hex string.

    Returns:
        Plain-text token string.
    """
    return secrets.token_hex(nbytes)


def hash_reset_token(plain_token: str) -> str:
    """
    Return a bcrypt hash of the plain reset token for safe DB storage.
    Same context as passwords to leverage existing rehash logic.
    """
    return _pwd_context.hash(plain_token)


def verify_reset_token(plain_token: str, hashed_token: str) -> bool:
    """Verify a plain reset token against its stored hash."""
    return _pwd_context.verify(plain_token, hashed_token)


def reset_token_expiry() -> datetime:
    """Return the expiry datetime for a newly generated reset token."""
    return _utc_now() + timedelta(
        seconds=settings.PASSWORD_RESET_TOKEN_EXPIRE_SECONDS
    )


def is_reset_token_expired(expires_at: datetime) -> bool:
    """Return True if the reset token expiry timestamp has passed."""
    if expires_at.tzinfo is None:
        # Treat naive datetimes as UTC (matches DB default NOW() behaviour)
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    return _utc_now() > expires_at


# ------------------------------------------------------------------ #
# Token pair helper (used by login & refresh endpoints)
# ------------------------------------------------------------------ #
def create_token_pair(
    user_id: int,
    role: str,
    *,
    office_id: Optional[int] = None,
) -> dict[str, str]:
    """
    Return both tokens as a dict ready for the API response body.

    Args:
        user_id:   DB primary key.
        role:      Role name string.
        office_id: Optional office/circle id stored as extra claim.
    """
    extra: dict[str, Any] = {}
    if office_id is not None:
        extra["office_id"] = office_id

    return {
        "access_token": create_access_token(
            user_id, role=role, extra_claims=extra or None
        ),
        "refresh_token": create_refresh_token(user_id),
        "token_type": "bearer",
    }


# Backwards compatibility aliases
create_password_reset_token = generate_password_reset_token
decode_token = decode_access_token
