import uuid

import pytest

from app.services.permissions import Permission, can_edit, can_view, resolve_permission

OWNER = uuid.uuid4()
SHARED = uuid.uuid4()
STRANGER = uuid.uuid4()


def test_owner_gets_owner_permission():
    assert resolve_permission(OWNER, OWNER, {}) is Permission.OWNER


def test_stranger_gets_none():
    assert resolve_permission(OWNER, STRANGER, {}) is None


def test_stranger_with_other_shares_still_gets_none():
    assert resolve_permission(OWNER, STRANGER, {SHARED: "edit"}) is None


@pytest.mark.parametrize("level", ["view", "comment", "edit"])
def test_shared_user_gets_their_level(level):
    assert resolve_permission(OWNER, SHARED, {SHARED: level}) is Permission(level)


def test_owner_wins_even_if_also_in_share_list():
    assert resolve_permission(OWNER, OWNER, {OWNER: "view"}) is Permission.OWNER


def test_unknown_permission_string_is_denied():
    assert resolve_permission(OWNER, SHARED, {SHARED: "superuser"}) is None


def test_can_edit_only_for_owner_and_edit():
    assert can_edit(Permission.OWNER) is True
    assert can_edit(Permission.EDIT) is True
    assert can_edit(Permission.COMMENT) is False
    assert can_edit(Permission.VIEW) is False
    assert can_edit(None) is False


def test_can_view_for_every_granted_level():
    assert can_view(Permission.OWNER) is True
    assert can_view(Permission.EDIT) is True
    assert can_view(Permission.COMMENT) is True
    assert can_view(Permission.VIEW) is True
    assert can_view(None) is False


def test_stored_owner_string_does_not_escalate_shared_user():
    """A stored 'owner' permission string must never promote a shared user to owner."""
    assert resolve_permission(OWNER, SHARED, {SHARED: "owner"}) is None


def test_empty_permission_string_is_denied():
    assert resolve_permission(OWNER, SHARED, {SHARED: ""}) is None


def test_permission_matching_is_case_sensitive():
    """Only exact lowercase permission values grant access; 'Edit' ≠ 'edit'."""
    assert resolve_permission(OWNER, SHARED, {SHARED: "Edit"}) is None
