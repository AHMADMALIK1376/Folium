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


def doc_content(text: str) -> dict:
    return {
        "type": "doc",
        "content": [{"type": "paragraph", "content": [{"type": "text", "text": text}]}],
    }


async def ensure_user(client: AsyncClient, email: str) -> None:
    await client.get("/api/v1/me", headers=auth_headers(email))


async def make_doc(client: AsyncClient, email: str, text: str = "first") -> str:
    response = await client.post(
        "/api/v1/documents",
        json={"title": "Versioned", "content": doc_content(text)},
        headers=auth_headers(email),
    )
    return response.json()["id"]


async def edit(client: AsyncClient, doc_id: str, email: str, text: str) -> None:
    await client.patch(
        f"/api/v1/documents/{doc_id}",
        json={"content": doc_content(text)},
        headers=auth_headers(email),
    )


async def share(client: AsyncClient, doc_id: str, owner: str, email: str, permission: str):
    return await client.post(
        f"/api/v1/documents/{doc_id}/shares",
        json={"email": email, "permission": permission},
        headers=auth_headers(owner),
    )


async def test_editing_produces_a_listable_version(client: AsyncClient, alice_email):
    doc_id = await make_doc(client, alice_email, "first")
    await edit(client, doc_id, alice_email, "second")

    response = await client.get(
        f"/api/v1/documents/{doc_id}/versions", headers=auth_headers(alice_email)
    )

    assert response.status_code == 200
    versions = response.json()
    assert len(versions) == 1
    assert versions[0]["author_name"]


async def test_the_list_never_carries_content(client: AsyncClient, alice_email):
    """A 50-entry list would otherwise return fifty full documents."""
    doc_id = await make_doc(client, alice_email)
    await edit(client, doc_id, alice_email, "second")

    response = await client.get(
        f"/api/v1/documents/{doc_id}/versions", headers=auth_headers(alice_email)
    )

    assert "content" not in response.json()[0]


async def test_a_version_can_be_read_with_its_content(client: AsyncClient, alice_email):
    doc_id = await make_doc(client, alice_email, "first")
    await edit(client, doc_id, alice_email, "second")

    listed = await client.get(
        f"/api/v1/documents/{doc_id}/versions", headers=auth_headers(alice_email)
    )
    version_id = listed.json()[0]["id"]

    response = await client.get(
        f"/api/v1/documents/{doc_id}/versions/{version_id}",
        headers=auth_headers(alice_email),
    )

    assert response.status_code == 200
    # The state that was replaced, which is what restoring returns to.
    assert response.json()["content"] == doc_content("first")


async def test_a_viewer_may_browse_history(client: AsyncClient, alice_email, bob_email):
    await ensure_user(client, bob_email)
    doc_id = await make_doc(client, alice_email)
    await edit(client, doc_id, alice_email, "second")
    await share(client, doc_id, alice_email, bob_email, "view")

    response = await client.get(
        f"/api/v1/documents/{doc_id}/versions", headers=auth_headers(bob_email)
    )

    # Someone who can read the document can already read its current content;
    # its history is the same document over time.
    assert response.status_code == 200
    assert len(response.json()) == 1


async def test_a_viewer_may_not_restore(client: AsyncClient, alice_email, bob_email):
    await ensure_user(client, bob_email)
    doc_id = await make_doc(client, alice_email)
    await edit(client, doc_id, alice_email, "second")
    await share(client, doc_id, alice_email, bob_email, "view")

    listed = await client.get(
        f"/api/v1/documents/{doc_id}/versions", headers=auth_headers(bob_email)
    )
    version_id = listed.json()[0]["id"]

    response = await client.post(
        f"/api/v1/documents/{doc_id}/versions/{version_id}/restore",
        headers=auth_headers(bob_email),
    )

    # 404, not 403: access-denied and does-not-exist stay indistinguishable.
    assert response.status_code == 404


async def test_an_editor_may_restore(client: AsyncClient, alice_email, bob_email):
    await ensure_user(client, bob_email)
    doc_id = await make_doc(client, alice_email, "first")
    await edit(client, doc_id, alice_email, "second")
    await share(client, doc_id, alice_email, bob_email, "edit")

    listed = await client.get(
        f"/api/v1/documents/{doc_id}/versions", headers=auth_headers(bob_email)
    )
    version_id = listed.json()[0]["id"]

    response = await client.post(
        f"/api/v1/documents/{doc_id}/versions/{version_id}/restore",
        headers=auth_headers(bob_email),
    )

    assert response.status_code == 200
    assert response.json()["content"] == doc_content("first")


async def test_a_stranger_sees_nothing(client: AsyncClient, alice_email, bob_email):
    await ensure_user(client, bob_email)
    doc_id = await make_doc(client, alice_email)
    await edit(client, doc_id, alice_email, "second")

    listed = await client.get(
        f"/api/v1/documents/{doc_id}/versions", headers=auth_headers(alice_email)
    )
    version_id = listed.json()[0]["id"]

    assert (
        await client.get(
            f"/api/v1/documents/{doc_id}/versions", headers=auth_headers(bob_email)
        )
    ).status_code == 404
    assert (
        await client.get(
            f"/api/v1/documents/{doc_id}/versions/{version_id}",
            headers=auth_headers(bob_email),
        )
    ).status_code == 404


async def test_a_version_id_from_another_document_is_not_readable(
    client: AsyncClient, alice_email
):
    """The one that turns a list endpoint into a data leak if it is missed.

    Filtering on the version id alone would let /documents/A/versions/{id-from-B}
    read B's content through A's permissions.
    """
    mine = await make_doc(client, alice_email, "mine")
    other = await make_doc(client, alice_email, "secret")
    await edit(client, other, alice_email, "changed")

    listed = await client.get(
        f"/api/v1/documents/{other}/versions", headers=auth_headers(alice_email)
    )
    foreign_version = listed.json()[0]["id"]

    response = await client.get(
        f"/api/v1/documents/{mine}/versions/{foreign_version}",
        headers=auth_headers(alice_email),
    )

    # Alice owns both documents, so this cannot be about permission — the route
    # must scope the version to the document in its own path.
    assert response.status_code == 404


async def test_restoring_a_foreign_version_is_refused(client: AsyncClient, alice_email):
    mine = await make_doc(client, alice_email, "mine")
    other = await make_doc(client, alice_email, "secret")
    await edit(client, other, alice_email, "changed")

    listed = await client.get(
        f"/api/v1/documents/{other}/versions", headers=auth_headers(alice_email)
    )
    foreign_version = listed.json()[0]["id"]

    response = await client.post(
        f"/api/v1/documents/{mine}/versions/{foreign_version}/restore",
        headers=auth_headers(alice_email),
    )

    assert response.status_code == 404


async def test_restoring_snapshots_the_current_state_first(
    client: AsyncClient, alice_email
):
    doc_id = await make_doc(client, alice_email, "first")
    await edit(client, doc_id, alice_email, "second")

    listed = await client.get(
        f"/api/v1/documents/{doc_id}/versions", headers=auth_headers(alice_email)
    )
    assert len(listed.json()) == 1
    version_id = listed.json()[0]["id"]

    await client.post(
        f"/api/v1/documents/{doc_id}/versions/{version_id}/restore",
        headers=auth_headers(alice_email),
    )

    after = await client.get(
        f"/api/v1/documents/{doc_id}/versions", headers=auth_headers(alice_email)
    )
    # Restoring the wrong draft must itself be undoable, so a restore is always
    # worth a row regardless of the interval.
    assert len(after.json()) == 2

    newest = after.json()[0]
    detail = await client.get(
        f"/api/v1/documents/{doc_id}/versions/{newest['id']}",
        headers=auth_headers(alice_email),
    )
    assert detail.json()["content"] == doc_content("second")


async def test_missing_version_is_not_found(client: AsyncClient, alice_email):
    doc_id = await make_doc(client, alice_email)

    response = await client.post(
        f"/api/v1/documents/{doc_id}/versions/{uuid.uuid4()}/restore",
        headers=auth_headers(alice_email),
    )

    assert response.status_code == 404


async def test_history_is_newest_first(client: AsyncClient, alice_email, bob_email):
    await ensure_user(client, bob_email)
    doc_id = await make_doc(client, alice_email, "first")
    await edit(client, doc_id, alice_email, "second")
    await share(client, doc_id, alice_email, bob_email, "edit")
    # A different author snapshots even inside the interval, which is how a
    # second version exists in a test that finishes in seconds.
    await edit(client, doc_id, bob_email, "third")

    listed = await client.get(
        f"/api/v1/documents/{doc_id}/versions", headers=auth_headers(alice_email)
    )
    versions = listed.json()

    assert len(versions) == 2
    assert versions[0]["created_at"] >= versions[1]["created_at"]


async def test_all_version_routes_require_authentication(client: AsyncClient, alice_email):
    doc_id = await make_doc(client, alice_email)

    assert (await client.get(f"/api/v1/documents/{doc_id}/versions")).status_code == 401
    assert (
        await client.get(f"/api/v1/documents/{doc_id}/versions/{uuid.uuid4()}")
    ).status_code == 401
    assert (
        await client.post(f"/api/v1/documents/{doc_id}/versions/{uuid.uuid4()}/restore")
    ).status_code == 401
