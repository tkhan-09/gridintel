
from typing import Any

from sqlalchemy import JSON, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base



class Role(Base):
    """
    Application role definition.

    ``permissions`` is a free-form JSON object whose structure is
    documented in the seed data:  ``{"resource": ["action", ...], ...}``.
    A SuperAdmin role may carry ``{"all": true}`` as a wildcard.
    """

    __tablename__ = "roles"
    __table_args__ = (
        UniqueConstraint("name", name="uq_roles_name"),
    )

    # ------------------------------------------------------------------ #
    # Columns
    # ------------------------------------------------------------------ #
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    name: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
        comment="Human-readable role name, e.g. SuperAdmin, Admin, Operator",
    )

    permissions: Mapped[dict[str, Any]] = mapped_column(
        JSON,
        nullable=False,
        default=dict,
        server_default="{}",
        comment="Resource → action-list permission map, or {\"all\": true} for SuperAdmin",
    )

    # ------------------------------------------------------------------ #
    # Relationships
    # ------------------------------------------------------------------ #

    # ------------------------------------------------------------------ #
    # Helpers
    # ------------------------------------------------------------------ #
    def has_permission(self, resource: str, action: str) -> bool:
        """
        Return True if this role is allowed to perform *action* on *resource*.

        SuperAdmin with ``{"all": true}`` always returns True.
        """
        if self.permissions.get("all") is True:
            return True
        allowed_actions: list[str] = self.permissions.get(resource, [])
        return action in allowed_actions

    def is_superadmin(self) -> bool:
        return self.name == "SuperAdmin"
