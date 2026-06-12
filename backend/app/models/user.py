

from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

from app.models.office import Office
from app.models.role import Role


class User(Base):
    """
    Platform user account.

    Passwords are stored as bcrypt hashes (never plain-text).
    Password-reset flow uses a single-use token stored hashed alongside
    an expiry timestamp; both fields are cleared after successful reset.
    """

    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("username", name="uq_users_username"),
        UniqueConstraint("email", name="uq_users_email"),
        Index("ix_users_role_id", "role_id"),
        Index("ix_users_office_id", "office_id"),
        Index("ix_users_is_active", "is_active"),
    )

    # ------------------------------------------------------------------ #
    # Columns
    # ------------------------------------------------------------------ #
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    username: Mapped[str] = mapped_column(
        String(80),
        nullable=False,
        index=True,
        comment="Unique login handle, lowercase, no spaces",
    )

    email: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
        index=True,
        comment="Contact email — used for password-reset delivery",
    )

    hashed_password: Mapped[str] = mapped_column(
        String(256),
        nullable=False,
        comment="Bcrypt hash of the user's password (cost factor from config)",
    )

    role_id: Mapped[int] = mapped_column(
        ForeignKey("roles.id", ondelete="RESTRICT"),
        nullable=False,
        comment="FK → roles.id; deletion of a role with active users is blocked",
    )

    office_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("offices.id", ondelete="SET NULL"),
        nullable=True,
        comment="FK → offices.id; NULL for head-office / cross-circle users",
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default="true",
        comment="Soft-disable flag; deactivated users cannot log in",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        comment="UTC timestamp of account creation",
    )

    # Password-reset fields — both cleared after a successful reset
    reset_token: Mapped[Optional[str]] = mapped_column(
        String(256),
        nullable=True,
        default=None,
        comment="Bcrypt hash of the single-use password-reset token",
    )

    reset_token_expires: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=None,
        comment="UTC expiry of the reset token (typically now + 1 hour)",
    )

    # ------------------------------------------------------------------ #
    # Relationships
    # ------------------------------------------------------------------ #
    role: Mapped[Role] = relationship(
        Role,
        lazy="joined",          # Role name is almost always needed together
        innerjoin=True,
    )

    office: Mapped[Optional[Office]] = relationship(
        Office,
        lazy="select",
    )

    # ------------------------------------------------------------------ #
    # Convenience helpers
    # ------------------------------------------------------------------ #
    @property
    def role_name(self) -> str:
        """Return the role name string without triggering a separate query."""
        return self.role.name if self.role else ""

    def clear_reset_token(self) -> None:
        """Wipe the reset token fields after a successful password change."""
        self.reset_token = None
        self.reset_token_expires = None

    def is_reset_token_valid(self, now: datetime) -> bool:
        """
        Return True if a reset token exists and has not yet expired.
        *now* must be timezone-aware (UTC).
        """
        if self.reset_token is None or self.reset_token_expires is None:
            return False
        exp = self.reset_token_expires
        if exp.tzinfo is None:
            from datetime import timezone
            exp = exp.replace(tzinfo=timezone.utc)
        return now < exp
