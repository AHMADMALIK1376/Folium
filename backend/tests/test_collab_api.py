"""The collaboration token endpoint.

The suite never talks to a real y-sweet server, exactly as it never talks to
Supabase: the SDK is replaced, and what is asserted is the order of operations
and the failure mapping.
"""

import uuid

import pytest
from httpx import AsyncClient

from app.config import settings
from app.services import collab as service
from tests.conftest import auth_headers


@pytest.fixture
def alice_email() -> str:
    return f"alice-{uuid.uuid4()}@example.com"


@pytest.fixture
def bob_email() -> str:
    return f"bob-{uuid.uuid4()}@example.com"


@pytest.fixture
def configured(monkeypatch):
    """A configured connection string, without a server behind it."""
    monkeypatch.setattr(settings, "y_sweet_connection_string", "ys://token@localhost:8080")


@pytest.fixture
def minted(monkeypatch):
    """Record what the SDK was asked for, and hand back a plausible token."""
    calls: list[tuple[str, str]] = []

    def fake_mint(doc_id: str, authorization: str = "full") -> dict[str, str]:
        calls.append((doc_id, authorization))
        return {
            "url": "ws://localhost:8080/d",
            "baseUrl": "http://localhost:8080/d",
            "docId": doc_id,
            "token": "a-room-token",
        }

    monkeypatch.setattr(service, "_mint", fake_mint)
    return calls


async def ensure_user(client: AsyncClient, email: str) -> None:
    await client.get("/api/v1/me", headers=auth_headers(email))


async def make_doc(client: AsyncClient, email: str) -> str:
    response = await client.post(
        "/api/v1/documents", json={"title": "Shared"}, headers=auth_headers(email)
    )
    return response.json()["id"]


async def test_unconfigured_reports_unavailable_rather_than_failing(
    client: AsyncClient, alice_email, monkeypatch
):
    """An unconfigured deployment is not a broken one.

    The editor falls back to single-user autosave, so a 500 here would make a
    working app look faulty.
    """
    monkeypatch.setattr(settings, "y_sweet_connection_string", "")
    doc_id = await make_doc(client, alice_email)

    response = await client.post(
        f"/api/v1/documents/{doc_id}/collab", headers=auth_headers(alice_email)
    )

    assert response.status_code == 200
    body = response.json()
    assert body["enabled"] is False
    assert body["token"] is None
    assert body["url"] is None


async def test_configured_returns_a_room_token(
    client: AsyncClient, alice_email, configured, minted
):
    doc_id = await make_doc(client, alice_email)

    response = await client.post(
        f"/api/v1/documents/{doc_id}/collab", headers=auth_headers(alice_email)
    )

    assert response.status_code == 200
    body = response.json()
    assert body["enabled"] is True
    assert body["token"] == "a-room-token"
    assert body["url"] == "ws://localhost:8080/d"
    assert body["base_url"] == "http://localhost:8080/d"
    assert body["permission"] == "owner"
    # An owner may write, so the token is not restricted.
    assert minted == [(service.room_id(uuid.UUID(doc_id)), "full")]


async def test_the_room_id_comes_from_the_document_not_the_request(
    client: AsyncClient, alice_email, configured, minted
):
    """A client that could name its own room could join the room of a document
    it is not allowed to read."""
    doc_id = await make_doc(client, alice_email)

    await client.post(
        f"/api/v1/documents/{doc_id}/collab",
        json={"doc_id": "somebody-elses-room"},
        headers=auth_headers(alice_email),
    )

    assert [doc for doc, _ in minted] == [service.room_id(uuid.UUID(doc_id))]
    assert "somebody-elses-room" not in [doc for doc, _ in minted]


async def test_a_stranger_gets_nothing_and_no_token_is_minted(
    client: AsyncClient, alice_email, bob_email, configured, minted
):
    doc_id = await make_doc(client, alice_email)

    response = await client.post(
        f"/api/v1/documents/{doc_id}/collab", headers=auth_headers(bob_email)
    )

    assert response.status_code == 404
    # Order matters: minting first and checking afterwards would hand out a
    # working token for a document the caller may not read.
    assert minted == []


async def test_a_viewer_is_told_they_are_read_only(
    client: AsyncClient, alice_email, bob_email, configured, minted
):
    await ensure_user(client, bob_email)
    doc_id = await make_doc(client, alice_email)
    await client.post(
        f"/api/v1/documents/{doc_id}/shares",
        json={"email": bob_email, "permission": "view"},
        headers=auth_headers(alice_email),
    )

    response = await client.post(
        f"/api/v1/documents/{doc_id}/collab", headers=auth_headers(bob_email)
    )

    assert response.status_code == 200
    assert response.json()["permission"] == "view"
    # And the token itself is read-only, so the boundary does not depend on the
    # browser behaving: y-sweet refuses their writes at the server.
    assert minted == [(service.room_id(uuid.UUID(doc_id)), "read-only")]


async def test_a_missing_document_is_not_found(
    client: AsyncClient, alice_email, configured, minted
):
    response = await client.post(
        f"/api/v1/documents/{uuid.uuid4()}/collab", headers=auth_headers(alice_email)
    )

    assert response.status_code == 404
    assert minted == []


async def test_an_unreachable_server_is_unavailable_not_unauthenticated(
    client: AsyncClient, alice_email, configured, monkeypatch
):
    """503, never 401.

    Phase 2A drew this distinction for the JWKS endpoint and it holds here: an
    outage must not read as every user's credentials failing.
    """

    def explode(doc_id: str, authorization: str = "full"):
        raise service.CollabUnavailableError("y-sweet is unreachable")

    monkeypatch.setattr(service, "_mint", explode)
    doc_id = await make_doc(client, alice_email)

    response = await client.post(
        f"/api/v1/documents/{doc_id}/collab", headers=auth_headers(alice_email)
    )

    assert response.status_code == 503


async def test_the_endpoint_requires_authentication(client: AsyncClient, alice_email):
    doc_id = await make_doc(client, alice_email)

    assert (await client.post(f"/api/v1/documents/{doc_id}/collab")).status_code == 401


async def test_the_session_identifies_the_caller_not_the_owner(
    client: AsyncClient, alice_email, bob_email, configured, minted
):
    """The editor labels cursors from this.

    Phase 4-i labelled every caret with the document owner's name, because the
    owner's profile was the only one the editor had. Asserted with a
    collaborator rather than the owner, so returning the owner still fails.
    """
    await ensure_user(client, bob_email)
    doc_id = await make_doc(client, alice_email)
    await client.post(
        f"/api/v1/documents/{doc_id}/shares",
        json={"email": bob_email, "permission": "edit"},
        headers=auth_headers(alice_email),
    )

    response = await client.post(
        f"/api/v1/documents/{doc_id}/collab", headers=auth_headers(bob_email)
    )

    assert response.status_code == 200
    user = response.json()["user"]
    assert user["email"] == bob_email
    assert user["display_name"]


async def test_the_caller_is_reported_even_when_collaboration_is_off(
    client: AsyncClient, alice_email, monkeypatch
):
    """The response shape stays constant, so a client never has to branch."""
    monkeypatch.setattr(settings, "y_sweet_connection_string", "")
    doc_id = await make_doc(client, alice_email)

    response = await client.post(
        f"/api/v1/documents/{doc_id}/collab", headers=auth_headers(alice_email)
    )

    assert response.json()["user"]["email"] == alice_email
