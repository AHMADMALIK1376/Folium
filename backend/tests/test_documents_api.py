import uuid

import pytest
from httpx import AsyncClient

from tests.conftest import auth_headers


@pytest.fixture
def alice() -> dict[str, str]:
    return auth_headers(f"alice-{uuid.uuid4()}@example.com")


@pytest.fixture
def bob() -> dict[str, str]:
    return auth_headers(f"bob-{uuid.uuid4()}@example.com")


async def test_create_document(client: AsyncClient, alice):
    response = await client.post("/api/v1/documents", json={"title": "My doc"}, headers=alice)
    assert response.status_code == 201
    body = response.json()
    assert body["title"] == "My doc"
    assert body["permission"] == "owner"
    assert body["content"] == {"type": "doc", "content": [{"type": "paragraph"}]}


async def test_create_rejects_blank_title(client: AsyncClient, alice):
    response = await client.post("/api/v1/documents", json={"title": "  "}, headers=alice)
    assert response.status_code == 422


async def test_owner_can_read_own_document(client: AsyncClient, alice):
    created = await client.post("/api/v1/documents", json={"title": "Mine"}, headers=alice)
    doc_id = created.json()["id"]
    response = await client.get(f"/api/v1/documents/{doc_id}", headers=alice)
    assert response.status_code == 200
    assert response.json()["title"] == "Mine"


async def test_stranger_gets_404_not_403(client: AsyncClient, alice, bob):
    created = await client.post("/api/v1/documents", json={"title": "Secret"}, headers=alice)
    doc_id = created.json()["id"]
    response = await client.get(f"/api/v1/documents/{doc_id}", headers=bob)
    assert response.status_code == 404


async def test_unknown_document_is_404(client: AsyncClient, alice):
    response = await client.get(f"/api/v1/documents/{uuid.uuid4()}", headers=alice)
    assert response.status_code == 404


async def test_update_title_and_content(client: AsyncClient, alice):
    created = await client.post("/api/v1/documents", json={"title": "Draft"}, headers=alice)
    doc_id = created.json()["id"]
    new_content = {
        "type": "doc",
        "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Hello"}]}],
    }
    response = await client.patch(
        f"/api/v1/documents/{doc_id}",
        json={"title": "Final", "content": new_content},
        headers=alice,
    )
    assert response.status_code == 200
    assert response.json()["title"] == "Final"
    assert response.json()["content"] == new_content


async def test_update_rejects_non_tiptap_content(client: AsyncClient, alice):
    created = await client.post("/api/v1/documents", json={"title": "Draft"}, headers=alice)
    doc_id = created.json()["id"]
    response = await client.patch(
        f"/api/v1/documents/{doc_id}",
        json={"content": {"not": "tiptap"}},
        headers=alice,
    )
    assert response.status_code == 422


async def test_stranger_cannot_update(client: AsyncClient, alice, bob):
    created = await client.post("/api/v1/documents", json={"title": "Mine"}, headers=alice)
    doc_id = created.json()["id"]
    response = await client.patch(
        f"/api/v1/documents/{doc_id}", json={"title": "Hijacked"}, headers=bob
    )
    assert response.status_code == 404


async def test_list_separates_owned_from_shared(client: AsyncClient, alice):
    await client.post("/api/v1/documents", json={"title": "One"}, headers=alice)
    response = await client.get("/api/v1/documents", headers=alice)
    assert response.status_code == 200
    body = response.json()
    assert len(body["owned"]) == 1
    assert body["shared"] == []


async def test_soft_delete_hides_from_list_but_allows_restore(client: AsyncClient, alice):
    created = await client.post("/api/v1/documents", json={"title": "Temp"}, headers=alice)
    doc_id = created.json()["id"]

    deleted = await client.delete(f"/api/v1/documents/{doc_id}", headers=alice)
    assert deleted.status_code == 204

    listing = await client.get("/api/v1/documents", headers=alice)
    assert all(d["id"] != doc_id for d in listing.json()["owned"])

    gone = await client.get(f"/api/v1/documents/{doc_id}", headers=alice)
    assert gone.status_code == 404

    restored = await client.post(f"/api/v1/documents/{doc_id}/restore", headers=alice)
    assert restored.status_code == 200

    back = await client.get(f"/api/v1/documents/{doc_id}", headers=alice)
    assert back.status_code == 200


async def test_stranger_cannot_delete(client: AsyncClient, alice, bob):
    created = await client.post("/api/v1/documents", json={"title": "Mine"}, headers=alice)
    doc_id = created.json()["id"]
    response = await client.delete(f"/api/v1/documents/{doc_id}", headers=bob)
    assert response.status_code == 404
