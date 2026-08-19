"""Folders: organisation, not access."""

import uuid

import pytest
from httpx import AsyncClient

from app.core.exceptions import ValidationError
from app.services.folders import clean_name
from tests.conftest import auth_headers


@pytest.fixture
def alice_email() -> str:
    return f"alice-{uuid.uuid4()}@example.com"


@pytest.fixture
def bob_email() -> str:
    return f"bob-{uuid.uuid4()}@example.com"


async def make_folder(client: AsyncClient, email: str, name: str) -> str:
    response = await client.post(
        "/api/v1/folders", json={"name": name}, headers=auth_headers(email)
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


async def make_doc(client: AsyncClient, email: str, title: str = "A document") -> str:
    response = await client.post(
        "/api/v1/documents",
        json={"title": title, "content": {"type": "doc", "content": []}},
        headers=auth_headers(email),
    )
    return response.json()["id"]


async def file_into(client: AsyncClient, doc_id: str, email: str, folder_id):
    return await client.patch(
        f"/api/v1/documents/{doc_id}",
        json={"folder_id": folder_id},
        headers=auth_headers(email),
    )


async def owned_item(client: AsyncClient, email: str, doc_id: str) -> dict:
    listing = (await client.get("/api/v1/documents", headers=auth_headers(email))).json()
    [item] = [d for d in listing["owned"] if d["id"] == doc_id]
    return item


def test_a_name_is_cleaned_and_required():
    assert clean_name("  Client   work  ") == "Client work"

    for bad in ["", "   ", "\n"]:
        with pytest.raises(ValidationError):
            clean_name(bad)


async def test_a_folder_can_be_created_and_listed(client, alice_email):
    folder_id = await make_folder(client, alice_email, "Clients")

    listed = (await client.get("/api/v1/folders", headers=auth_headers(alice_email))).json()

    assert [f["id"] for f in listed] == [folder_id]
    assert listed[0]["document_count"] == 0


async def test_the_count_reflects_what_is_filed(client, alice_email):
    folder_id = await make_folder(client, alice_email, "Clients")
    doc_id = await make_doc(client, alice_email)
    await file_into(client, doc_id, alice_email, folder_id)

    listed = (await client.get("/api/v1/folders", headers=auth_headers(alice_email))).json()

    assert listed[0]["document_count"] == 1


async def test_a_trashed_document_leaves_the_count(client, alice_email):
    """A deleted document is not in the folder as far as the number goes."""
    folder_id = await make_folder(client, alice_email, "Clients")
    doc_id = await make_doc(client, alice_email)
    await file_into(client, doc_id, alice_email, folder_id)
    await client.delete(f"/api/v1/documents/{doc_id}", headers=auth_headers(alice_email))

    listed = (await client.get("/api/v1/folders", headers=auth_headers(alice_email))).json()

    assert listed[0]["document_count"] == 0


async def test_deleting_a_folder_keeps_its_documents(client, alice_email):
    """The decision this phase turns on. Reorganising must never destroy work,
    and there is already a trash for deleting."""
    folder_id = await make_folder(client, alice_email, "Clients")
    doc_id = await make_doc(client, alice_email, "Important")
    await file_into(client, doc_id, alice_email, folder_id)

    response = await client.delete(
        f"/api/v1/folders/{folder_id}", headers=auth_headers(alice_email)
    )
    assert response.status_code == 204

    document = (
        await client.get(f"/api/v1/documents/{doc_id}", headers=auth_headers(alice_email))
    ).json()
    assert document["title"] == "Important"
    assert (await owned_item(client, alice_email, doc_id))["folder_id"] is None


async def test_a_folder_can_be_renamed(client, alice_email):
    folder_id = await make_folder(client, alice_email, "Clients")

    response = await client.patch(
        f"/api/v1/folders/{folder_id}",
        json={"name": "Client work"},
        headers=auth_headers(alice_email),
    )

    assert response.status_code == 200
    assert response.json()["name"] == "Client work"


async def test_two_folders_cannot_share_a_name(client, alice_email):
    """Two folders called Clients in one sidebar is a bug report waiting."""
    await make_folder(client, alice_email, "Clients")

    response = await client.post(
        "/api/v1/folders", json={"name": "Clients"}, headers=auth_headers(alice_email)
    )

    assert response.status_code == 422


async def test_two_people_may_each_have_a_folder_of_the_same_name(
    client, alice_email, bob_email
):
    await make_folder(client, alice_email, "Clients")

    assert (
        await client.post(
            "/api/v1/folders", json={"name": "Clients"}, headers=auth_headers(bob_email)
        )
    ).status_code == 201


async def test_another_persons_folder_is_invisible(client, alice_email, bob_email):
    folder_id = await make_folder(client, alice_email, "Private")

    assert (await client.get("/api/v1/folders", headers=auth_headers(bob_email))).json() == []
    assert (
        await client.patch(
            f"/api/v1/folders/{folder_id}",
            json={"name": "Renamed"},
            headers=auth_headers(bob_email),
        )
    ).status_code == 404
    assert (
        await client.delete(f"/api/v1/folders/{folder_id}", headers=auth_headers(bob_email))
    ).status_code == 404


async def test_filing_into_another_persons_folder_is_refused(client, alice_email, bob_email):
    """Not silently ignored: that would leave the document unfiled with no
    explanation. And not accepted, obviously."""
    folder_id = await make_folder(client, alice_email, "Private")
    bob_doc = await make_doc(client, bob_email)

    response = await file_into(client, bob_doc, bob_email, folder_id)

    assert response.status_code == 404


async def test_a_document_can_be_unfiled(client, alice_email):
    folder_id = await make_folder(client, alice_email, "Clients")
    doc_id = await make_doc(client, alice_email)
    await file_into(client, doc_id, alice_email, folder_id)

    await file_into(client, doc_id, alice_email, None)

    assert (await owned_item(client, alice_email, doc_id))["folder_id"] is None


async def test_a_title_only_save_does_not_unfile_the_document(client, alice_email):
    """The reason folder_id uses model_fields_set rather than a None check.
    Autosave PATCHes a title on its own constantly; if that read as "unfile",
    every document would fall out of its folder while being typed in."""
    folder_id = await make_folder(client, alice_email, "Clients")
    doc_id = await make_doc(client, alice_email)
    await file_into(client, doc_id, alice_email, folder_id)

    await client.patch(
        f"/api/v1/documents/{doc_id}",
        json={"title": "A new title"},
        headers=auth_headers(alice_email),
    )

    assert (await owned_item(client, alice_email, doc_id))["folder_id"] == folder_id


async def test_a_collaborator_cannot_file_someone_elses_document(
    client, alice_email, bob_email
):
    """Filing is organisation, not access — but a collaborator filing a document
    into a folder the owner cannot see would be neither."""
    await client.get("/api/v1/me", headers=auth_headers(bob_email))
    doc_id = await make_doc(client, alice_email)
    await client.post(
        f"/api/v1/documents/{doc_id}/shares",
        json={"email": bob_email, "permission": "edit"},
        headers=auth_headers(alice_email),
    )
    bob_folder = await make_folder(client, bob_email, "Mine")

    response = await file_into(client, doc_id, bob_email, bob_folder)

    assert response.status_code == 404


async def test_folder_routes_require_authentication(client):
    assert (await client.get("/api/v1/folders")).status_code == 401
    assert (await client.post("/api/v1/folders", json={"name": "x"})).status_code == 401
