"""The resolved-user cache, and the things it must not get wrong.

Every authenticated request resolves the caller, and that resolution was a
SELECT against a hosted Postgres in another region — measured at ~480ms, which
was the floor for `GET /me`, an endpoint that does nothing else. A document page
makes six or seven authenticated calls, so the app paid three seconds of pure
"who are you" before any of them did their own work.

Caching that is only safe if it can still notice a changed profile and cannot
hand one caller another caller's identity. Both are asserted here.
"""

import uuid

import pytest
from sqlalchemy import event

from app.db.session import engine
from tests.conftest import auth_headers


@pytest.fixture
def user_selects():
    """Count SELECTs against the users table."""
    counter = {"n": 0}

    def before_execute(conn, cursor, statement, parameters, context, executemany):
        normalised = " ".join(statement.lower().split())
        if normalised.startswith("select") and "from users" in normalised:
            counter["n"] += 1

    event.listen(engine.sync_engine, "before_cursor_execute", before_execute)
    yield counter
    event.remove(engine.sync_engine, "before_cursor_execute", before_execute)


async def test_a_second_request_does_not_look_the_user_up_again(client, user_selects):
    """The whole point: one resolution, then the rest of the page is free."""
    email = f"cache-{uuid.uuid4()}@example.com"

    assert (await client.get("/api/v1/me", headers=auth_headers(email))).status_code == 200
    after_first = user_selects["n"]
    assert after_first >= 1, "the first request must actually resolve the user"

    for _ in range(3):
        assert (await client.get("/api/v1/me", headers=auth_headers(email))).status_code == 200

    assert user_selects["n"] == after_first, "a warm cache must not read the users table again"


async def test_a_changed_display_name_is_not_served_from_the_cache(client):
    """Supabase is the source of truth for a profile, and it arrives in the
    token. A cache that ignored that would show the old name until it expired."""
    email = f"cache-{uuid.uuid4()}@example.com"

    await client.get(
        "/api/v1/me", headers=auth_headers(email, user_metadata={"full_name": "Ada Lovelace"})
    )

    changed = await client.get(
        "/api/v1/me", headers=auth_headers(email, user_metadata={"full_name": "Ada Byron"})
    )

    assert changed.json()["display_name"] == "Ada Byron"


async def test_a_changed_profile_reaches_the_database(client):
    """Not just the response. A cache miss falls through to `_provision_user`,
    which is what keeps the row in step with Supabase — if the new name only
    ever appeared in the response, every other reader would still see the old
    one."""
    email = f"cache-{uuid.uuid4()}@example.com"
    await client.get(
        "/api/v1/me", headers=auth_headers(email, user_metadata={"full_name": "Before"})
    )
    await client.get(
        "/api/v1/me", headers=auth_headers(email, user_metadata={"full_name": "After"})
    )

    # Seen through another person's eyes: a share carries the display name
    # straight from the users table.
    owner = f"owner-{uuid.uuid4()}@example.com"
    document = (
        await client.post(
            "/api/v1/documents",
            json={"title": "Shared", "content": {"type": "doc", "content": []}},
            headers=auth_headers(owner),
        )
    ).json()["id"]
    await client.post(
        f"/api/v1/documents/{document}/shares",
        json={"email": email, "permission": "view"},
        headers=auth_headers(owner),
    )

    shares = (
        await client.get(
            f"/api/v1/documents/{document}/shares", headers=auth_headers(owner)
        )
    ).json()

    assert [s["display_name"] for s in shares] == ["After"]


async def test_one_caller_is_never_served_another_callers_identity(client):
    """The cache is keyed by the token's subject. Two people using the app at
    once is the ordinary case, not the exotic one."""
    first = f"cache-a-{uuid.uuid4()}@example.com"
    second = f"cache-b-{uuid.uuid4()}@example.com"

    a = (await client.get("/api/v1/me", headers=auth_headers(first))).json()
    b = (await client.get("/api/v1/me", headers=auth_headers(second))).json()
    # And again, now that both are cached.
    a_again = (await client.get("/api/v1/me", headers=auth_headers(first))).json()

    assert a["email"] == first
    assert b["email"] == second
    assert a_again == a
    assert a["id"] != b["id"]
