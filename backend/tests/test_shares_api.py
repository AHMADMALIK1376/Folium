import uuid

import pytest
from httpx import AsyncClient


@pytest.fixture
def alice_email() -> str:
    return f"alice-{uuid.uuid4()}@example.com"


@pytest.fixture
def bob_email() -> str:
    return f"bob-{uuid.uuid4()}@example.com"


@pytest.fixture
def carol_email() -> str:
    return f"carol-{uuid.uuid4()}@example.com"


def headers(email: str) -> dict[str, str]:
    return {"X-Dev-User-Email": email}


async def make_doc(client: AsyncClient, email: str, title: str = "Doc") -> str:
    response = await client.post(
        "/api/v1/documents", json={"title": title}, headers=headers(email)
    )
    return response.json()["id"]


async def ensure_user(client: AsyncClient, email: str) -> None:
    await client.get("/api/v1/me", headers=headers(email))


async def test_owner_can_share_and_recipient_sees_it(
    client: AsyncClient, alice_email, bob_email
):
    await ensure_user(client, bob_email)
    doc_id = await make_doc(client, alice_email)

    response = await client.post(
        f"/api/v1/documents/{doc_id}/shares",
        json={"email": bob_email, "permission": "edit"},
        headers=headers(alice_email),
    )
    assert response.status_code == 201

    listing = await client.get("/api/v1/documents", headers=headers(bob_email))
    assert [d["id"] for d in listing.json()["shared"]] == [doc_id]


async def test_shared_viewer_can_read_but_not_edit(
    client: AsyncClient, alice_email, bob_email
):
    await ensure_user(client, bob_email)
    doc_id = await make_doc(client, alice_email)
    await client.post(
        f"/api/v1/documents/{doc_id}/shares",
        json={"email": bob_email, "permission": "view"},
        headers=headers(alice_email),
    )

    read = await client.get(f"/api/v1/documents/{doc_id}", headers=headers(bob_email))
    assert read.status_code == 200
    assert read.json()["permission"] == "view"

    write = await client.patch(
        f"/api/v1/documents/{doc_id}", json={"title": "Nope"}, headers=headers(bob_email)
    )
    assert write.status_code == 404


async def test_shared_editor_can_edit(client: AsyncClient, alice_email, bob_email):
    await ensure_user(client, bob_email)
    doc_id = await make_doc(client, alice_email)
    await client.post(
        f"/api/v1/documents/{doc_id}/shares",
        json={"email": bob_email, "permission": "edit"},
        headers=headers(alice_email),
    )

    write = await client.patch(
        f"/api/v1/documents/{doc_id}", json={"title": "Edited"}, headers=headers(bob_email)
    )
    assert write.status_code == 200


async def test_sharing_with_unknown_email_is_422(client: AsyncClient, alice_email):
    doc_id = await make_doc(client, alice_email)
    response = await client.post(
        f"/api/v1/documents/{doc_id}/shares",
        json={"email": "nobody@example.com", "permission": "edit"},
        headers=headers(alice_email),
    )
    assert response.status_code == 422


async def test_cannot_share_with_yourself(client: AsyncClient, alice_email):
    doc_id = await make_doc(client, alice_email)
    response = await client.post(
        f"/api/v1/documents/{doc_id}/shares",
        json={"email": alice_email, "permission": "edit"},
        headers=headers(alice_email),
    )
    assert response.status_code == 422


async def test_non_owner_cannot_share(client: AsyncClient, alice_email, bob_email):
    await ensure_user(client, bob_email)
    doc_id = await make_doc(client, alice_email)
    response = await client.post(
        f"/api/v1/documents/{doc_id}/shares",
        json={"email": bob_email, "permission": "edit"},
        headers=headers(bob_email),
    )
    assert response.status_code == 404


async def test_resharing_updates_the_permission(client: AsyncClient, alice_email, bob_email):
    await ensure_user(client, bob_email)
    doc_id = await make_doc(client, alice_email)
    for level in ("view", "edit"):
        await client.post(
            f"/api/v1/documents/{doc_id}/shares",
            json={"email": bob_email, "permission": level},
            headers=headers(alice_email),
        )

    listing = await client.get(
        f"/api/v1/documents/{doc_id}/shares", headers=headers(alice_email)
    )
    assert len(listing.json()) == 1
    assert listing.json()[0]["permission"] == "edit"


async def test_unshare_revokes_access(client: AsyncClient, alice_email, bob_email):
    await ensure_user(client, bob_email)
    doc_id = await make_doc(client, alice_email)
    share = await client.post(
        f"/api/v1/documents/{doc_id}/shares",
        json={"email": bob_email, "permission": "edit"},
        headers=headers(alice_email),
    )
    bob_id = share.json()["user_id"]

    removed = await client.delete(
        f"/api/v1/documents/{doc_id}/shares/{bob_id}", headers=headers(alice_email)
    )
    assert removed.status_code == 204

    denied = await client.get(f"/api/v1/documents/{doc_id}", headers=headers(bob_email))
    assert denied.status_code == 404


async def test_editor_cannot_reshare_document(
    client: AsyncClient, alice_email, bob_email, carol_email
):
    await ensure_user(client, bob_email)
    await ensure_user(client, carol_email)
    doc_id = await make_doc(client, alice_email)
    await client.post(
        f"/api/v1/documents/{doc_id}/shares",
        json={"email": bob_email, "permission": "edit"},
        headers=headers(alice_email),
    )

    response = await client.post(
        f"/api/v1/documents/{doc_id}/shares",
        json={"email": carol_email, "permission": "edit"},
        headers=headers(bob_email),
    )
    assert response.status_code == 404

    listing = await client.get("/api/v1/documents", headers=headers(carol_email))
    assert listing.json()["shared"] == []


async def test_editor_cannot_change_another_users_permission(
    client: AsyncClient, alice_email, bob_email, carol_email
):
    await ensure_user(client, bob_email)
    await ensure_user(client, carol_email)
    doc_id = await make_doc(client, alice_email)
    await client.post(
        f"/api/v1/documents/{doc_id}/shares",
        json={"email": bob_email, "permission": "edit"},
        headers=headers(alice_email),
    )
    share = await client.post(
        f"/api/v1/documents/{doc_id}/shares",
        json={"email": carol_email, "permission": "view"},
        headers=headers(alice_email),
    )
    carol_id = share.json()["user_id"]

    response = await client.patch(
        f"/api/v1/documents/{doc_id}/shares/{carol_id}",
        json={"permission": "edit"},
        headers=headers(bob_email),
    )
    assert response.status_code == 404

    shares = await client.get(
        f"/api/v1/documents/{doc_id}/shares", headers=headers(alice_email)
    )
    carol_share = next(s for s in shares.json() if s["user_id"] == carol_id)
    assert carol_share["permission"] == "view"


async def test_editor_cannot_revoke_another_users_access(
    client: AsyncClient, alice_email, bob_email, carol_email
):
    await ensure_user(client, bob_email)
    await ensure_user(client, carol_email)
    doc_id = await make_doc(client, alice_email)
    await client.post(
        f"/api/v1/documents/{doc_id}/shares",
        json={"email": bob_email, "permission": "edit"},
        headers=headers(alice_email),
    )
    share = await client.post(
        f"/api/v1/documents/{doc_id}/shares",
        json={"email": carol_email, "permission": "view"},
        headers=headers(alice_email),
    )
    carol_id = share.json()["user_id"]

    response = await client.delete(
        f"/api/v1/documents/{doc_id}/shares/{carol_id}",
        headers=headers(bob_email),
    )
    assert response.status_code == 404

    shares = await client.get(
        f"/api/v1/documents/{doc_id}/shares", headers=headers(alice_email)
    )
    carol_ids = [s["user_id"] for s in shares.json()]
    assert carol_id in carol_ids
