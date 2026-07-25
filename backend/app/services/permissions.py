from enum import Enum
from uuid import UUID


class Permission(str, Enum):
    VIEW = "view"
    COMMENT = "comment"
    EDIT = "edit"
    OWNER = "owner"


def resolve_permission(
    owner_id: UUID, user_id: UUID, shares: dict[UUID, str]
) -> Permission | None:
    """Return the permission `user_id` holds on a document, or None if no access.

    Pure by design: no database access, no HTTP. `shares` maps user id to the
    stored permission string. Unrecognised permission strings are denied rather
    than trusted, so bad data fails closed.
    """
    if owner_id == user_id:
        return Permission.OWNER

    granted = shares.get(user_id)
    if granted is None:
        return None

    try:
        permission = Permission(granted)
    except ValueError:
        return None

    return None if permission is Permission.OWNER else permission


def can_edit(permission: Permission | None) -> bool:
    return permission in (Permission.OWNER, Permission.EDIT)


def can_view(permission: Permission | None) -> bool:
    return permission is not None
