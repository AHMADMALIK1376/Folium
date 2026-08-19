"""Diffing a version against the current document."""

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


def body(text: str) -> dict:
    return {
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "attrs": {"textAlign": None},
                "content": [{"type": "text", "text": text}],
            }
        ],
    }


async def make_doc(client: AsyncClient, email: str, text: str) -> str:
    response = await client.post(
        "/api/v1/documents",
        json={"title": "A document", "content": body(text)},
        headers=auth_headers(email),
    )
    return response.json()["id"]


async def edit(client: AsyncClient, doc_id: str, email: str, text: str) -> None:
    await client.patch(
        f"/api/v1/documents/{doc_id}",
        json={"content": body(text)},
        headers=auth_headers(email),
    )


async def first_version(client: AsyncClient, doc_id: str, email: str) -> str:
    response = await client.get(
        f"/api/v1/documents/{doc_id}/versions", headers=auth_headers(email)
    )
    return response.json()[-1]["id"]


async def test_a_diff_reports_what_changed(client, alice_email):
    doc_id = await make_doc(client, alice_email, "the quick brown fox")
    await edit(client, doc_id, alice_email, "the slow brown fox indeed")
    version_id = await first_version(client, doc_id, alice_email)

    response = await client.get(
        f"/api/v1/documents/{doc_id}/versions/{version_id}/diff",
        headers=auth_headers(alice_email),
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["removed"] >= 1
    assert payload["added"] >= 1
    ops = {s["op"] for s in payload["segments"]}
    assert "added" in ops and "removed" in ops


async def test_an_unchanged_document_reports_no_changes(client, alice_email):
    doc_id = await make_doc(client, alice_email, "unchanged words here")
    # A title-only edit records no version and changes no text.
    await client.patch(
        f"/api/v1/documents/{doc_id}",
        json={"content": body("unchanged words here")},
        headers=auth_headers(alice_email),
    )
    version_id = await first_version(client, doc_id, alice_email)

    payload = (
        await client.get(
            f"/api/v1/documents/{doc_id}/versions/{version_id}/diff",
            headers=auth_headers(alice_email),
        )
    ).json()

    assert (payload["added"], payload["removed"]) == (0, 0)


async def test_a_viewer_may_read_a_diff(client, alice_email, bob_email):
    """Follows view, like the rest of history: a diff discloses nothing a reader
    could not get by opening both versions themselves."""
    await client.get("/api/v1/me", headers=auth_headers(bob_email))
    doc_id = await make_doc(client, alice_email, "first text")
    await edit(client, doc_id, alice_email, "second text")
    await client.post(
        f"/api/v1/documents/{doc_id}/shares",
        json={"email": bob_email, "permission": "view"},
        headers=auth_headers(alice_email),
    )
    version_id = await first_version(client, doc_id, alice_email)

    response = await client.get(
        f"/api/v1/documents/{doc_id}/versions/{version_id}/diff",
        headers=auth_headers(bob_email),
    )

    assert response.status_code == 200


async def test_a_stranger_gets_nothing(client, alice_email, bob_email):
    doc_id = await make_doc(client, alice_email, "private text")
    await edit(client, doc_id, alice_email, "changed text")
    version_id = await first_version(client, doc_id, alice_email)

    response = await client.get(
        f"/api/v1/documents/{doc_id}/versions/{version_id}/diff",
        headers=auth_headers(bob_email),
    )

    assert response.status_code == 404


async def test_a_version_from_another_document_is_not_reachable(client, alice_email):
    """Both are Alice's, so this is about scoping rather than permission —
    matching on the version alone would make one document a way to read
    another's content."""
    mine = await make_doc(client, alice_email, "mine")
    other = await make_doc(client, alice_email, "theirs")
    await edit(client, other, alice_email, "theirs edited")
    foreign = await first_version(client, other, alice_email)

    response = await client.get(
        f"/api/v1/documents/{mine}/versions/{foreign}/diff",
        headers=auth_headers(alice_email),
    )

    assert response.status_code == 404


async def test_a_diff_requires_authentication(client, alice_email):
    doc_id = await make_doc(client, alice_email, "text")
    await edit(client, doc_id, alice_email, "more text")
    version_id = await first_version(client, doc_id, alice_email)

    assert (
        await client.get(f"/api/v1/documents/{doc_id}/versions/{version_id}/diff")
    ).status_code == 401
