"""Starring documents."""

import uuid

import pytest
from httpx import AsyncClient

from tests.conftest import auth_headers


@pytest.fixture
def alice_email() -> str:
    return f"alice-{uuid.uuid4()}@example.com"


@pytest.fixture
def bob_email() -> str:
    return f"bob-{uuid.uuid4()}@example.com"


async def make_doc(client: AsyncClient, email: str, title: str = "A document") -> str:
    response = await client.post(
        "/api/v1/documents",
        json={"title": title, "content": {"type": "doc", "content": []}},
        headers=auth_headers(email),
    )
    return response.json()["id"]


async def starred(client: AsyncClient, email: str) -> list[str]:
    response = await client.get("/api/v1/documents/starred", headers=auth_headers(email))
    assert response.status_code == 200, response.text
    return [d["id"] for d in response.json()]


async def test_a_document_can_be_starred_and_listed(client, alice_email):
    doc_id = await make_doc(client, alice_email)

    response = await client.put(
        f"/api/v1/documents/{doc_id}/star", headers=auth_headers(alice_email)
    )

    assert response.status_code == 204
    assert await starred(client, alice_email) == [doc_id]


async def test_starring_twice_leaves_one_star(client, alice_email):
    """PUT, and idempotent by the composite primary key: two clicks in quick
    succession cannot race into a duplicate-key error."""
    doc_id = await make_doc(client, alice_email)

    for _ in range(3):
        assert (
            await client.put(
                f"/api/v1/documents/{doc_id}/star", headers=auth_headers(alice_email)
            )
        ).status_code == 204

    assert await starred(client, alice_email) == [doc_id]


async def test_a_star_can_be_removed(client, alice_email):
    doc_id = await make_doc(client, alice_email)
    await client.put(f"/api/v1/documents/{doc_id}/star", headers=auth_headers(alice_email))

    response = await client.delete(
        f"/api/v1/documents/{doc_id}/star", headers=auth_headers(alice_email)
    )

    assert response.status_code == 204
    assert await starred(client, alice_email) == []


async def test_removing_a_star_that_is_not_there_succeeds(client, alice_email):
    doc_id = await make_doc(client, alice_email)

    assert (
        await client.delete(
            f"/api/v1/documents/{doc_id}/star", headers=auth_headers(alice_email)
        )
    ).status_code == 204


async def test_a_star_is_private_to_the_person_who_made_it(client, alice_email, bob_email):
    """The reason this is a table and not a column on documents: a document
    shared with three people can be important to one and routine to the others.
    """
    await client.get("/api/v1/me", headers=auth_headers(bob_email))
    doc_id = await make_doc(client, alice_email)
    await client.post(
        f"/api/v1/documents/{doc_id}/shares",
        json={"email": bob_email, "permission": "view"},
        headers=auth_headers(alice_email),
    )

    await client.put(f"/api/v1/documents/{doc_id}/star", headers=auth_headers(bob_email))

    assert await starred(client, bob_email) == [doc_id]
    assert await starred(client, alice_email) == []


async def test_a_viewer_may_star_because_a_star_is_not_a_change(
    client, alice_email, bob_email
):
    await client.get("/api/v1/me", headers=auth_headers(bob_email))
    doc_id = await make_doc(client, alice_email)
    await client.post(
        f"/api/v1/documents/{doc_id}/shares",
        json={"email": bob_email, "permission": "view"},
        headers=auth_headers(alice_email),
    )

    assert (
        await client.put(f"/api/v1/documents/{doc_id}/star", headers=auth_headers(bob_email))
    ).status_code == 204


async def test_a_stranger_cannot_star(client, alice_email, bob_email):
    doc_id = await make_doc(client, alice_email)

    assert (
        await client.put(f"/api/v1/documents/{doc_id}/star", headers=auth_headers(bob_email))
    ).status_code == 404
    assert (
        await client.delete(f"/api/v1/documents/{doc_id}/star", headers=auth_headers(bob_email))
    ).status_code == 404


async def test_a_deleted_document_leaves_the_starred_list(client, alice_email):
    """A document in the trash is not a shortcut."""
    doc_id = await make_doc(client, alice_email)
    await client.put(f"/api/v1/documents/{doc_id}/star", headers=auth_headers(alice_email))

    await client.delete(f"/api/v1/documents/{doc_id}", headers=auth_headers(alice_email))

    assert await starred(client, alice_email) == []


async def test_restoring_a_document_restores_its_star(client, alice_email):
    """The star is kept rather than removed when a document is trashed. Deleting
    is meant to be undoable, and discarding the bookmark would make it a little
    less so."""
    doc_id = await make_doc(client, alice_email)
    await client.put(f"/api/v1/documents/{doc_id}/star", headers=auth_headers(alice_email))
    await client.delete(f"/api/v1/documents/{doc_id}", headers=auth_headers(alice_email))

    await client.post(
        f"/api/v1/documents/{doc_id}/restore", headers=auth_headers(alice_email)
    )

    assert await starred(client, alice_email) == [doc_id]


async def test_the_newest_star_comes_first(client, alice_email):
    first = await make_doc(client, alice_email, "First")
    second = await make_doc(client, alice_email, "Second")

    await client.put(f"/api/v1/documents/{first}/star", headers=auth_headers(alice_email))
    await client.put(f"/api/v1/documents/{second}/star", headers=auth_headers(alice_email))

    assert await starred(client, alice_email) == [second, first]


async def test_star_routes_require_authentication(client, alice_email):
    doc_id = await make_doc(client, alice_email)

    assert (await client.get("/api/v1/documents/starred")).status_code == 401
    assert (await client.put(f"/api/v1/documents/{doc_id}/star")).status_code == 401
    assert (await client.delete(f"/api/v1/documents/{doc_id}/star")).status_code == 401
