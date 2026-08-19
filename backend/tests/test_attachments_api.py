"""The attachment routes, against a fake Storage.

The real client is replaced wholesale, so nothing here needs a bucket, a
service-role key, or a network. That is the point of keeping the boundary in one
module.
"""

import uuid

import pytest
from httpx import AsyncClient

from app.config import settings
from app.services import storage
from tests.conftest import auth_headers

PNG = b"\x89PNG\r\n\x1a\n" + b"fake image bytes"


@pytest.fixture
def alice_email() -> str:
    return f"alice-{uuid.uuid4()}@example.com"


@pytest.fixture
def bob_email() -> str:
    return f"bob-{uuid.uuid4()}@example.com"


@pytest.fixture
def fake_storage(monkeypatch):
    """Stand in for Supabase Storage, recording what it was asked to do."""
    stored: dict[str, bytes] = {}

    async def upload(path, data, content_type):
        stored[path] = data

    async def signed_url(path, expires_in=300):
        return f"https://storage.test/signed/{path}?token=abc"

    async def remove(paths):
        for path in paths:
            stored.pop(path, None)

    monkeypatch.setattr(settings, "supabase_url", "https://test.supabase.co")
    monkeypatch.setattr(settings, "supabase_service_role_key", "service-key")
    monkeypatch.setattr(storage, "upload", upload)
    monkeypatch.setattr(storage, "signed_url", signed_url)
    monkeypatch.setattr(storage, "remove", remove)

    return stored


async def ensure_user(client: AsyncClient, email: str) -> None:
    await client.get("/api/v1/me", headers=auth_headers(email))


async def make_doc(client: AsyncClient, email: str) -> str:
    response = await client.post(
        "/api/v1/documents",
        json={"title": "Quarterly plan", "content": {"type": "doc", "content": []}},
        headers=auth_headers(email),
    )
    return response.json()["id"]


async def attach(client: AsyncClient, doc_id: str, email: str, name: str = "photo.png", data=PNG):
    return await client.post(
        f"/api/v1/documents/{doc_id}/attachments",
        files={"file": (name, data, "image/png")},
        headers=auth_headers(email),
    )


async def share(client: AsyncClient, doc_id: str, owner: str, guest: str, permission: str):
    await client.post(
        f"/api/v1/documents/{doc_id}/shares",
        json={"email": guest, "permission": permission},
        headers=auth_headers(owner),
    )


async def test_a_file_can_be_attached_and_listed(client, alice_email, fake_storage):
    doc_id = await make_doc(client, alice_email)

    created = await attach(client, doc_id, alice_email)

    assert created.status_code == 201
    body = created.json()
    assert body["filename"] == "photo.png"
    assert body["mime_type"] == "image/png"
    assert body["size_bytes"] == len(PNG)

    listed = await client.get(
        f"/api/v1/documents/{doc_id}/attachments", headers=auth_headers(alice_email)
    )
    assert [a["id"] for a in listed.json()] == [body["id"]]


async def test_the_stored_path_holds_no_user_input(client, alice_email, fake_storage):
    doc_id = await make_doc(client, alice_email)

    await attach(client, doc_id, alice_email, name="../../etc/passwd.png")

    [path] = fake_storage.keys()
    assert ".." not in path
    assert "passwd" not in path


async def test_the_response_never_leaks_the_storage_path(client, alice_email, fake_storage):
    """It is an address in a private bucket and no caller has any use for it."""
    doc_id = await make_doc(client, alice_email)

    body = (await attach(client, doc_id, alice_email)).json()

    assert "storage_path" not in body


async def test_a_download_url_is_issued(client, alice_email, fake_storage):
    doc_id = await make_doc(client, alice_email)
    attachment_id = (await attach(client, doc_id, alice_email)).json()["id"]

    response = await client.get(
        f"/api/v1/documents/{doc_id}/attachments/{attachment_id}/url",
        headers=auth_headers(alice_email),
    )

    assert response.status_code == 200
    assert response.json()["url"].startswith("https://storage.test/signed/")
    assert response.json()["expires_in"] > 0


async def test_an_attachment_can_be_removed(client, alice_email, fake_storage):
    doc_id = await make_doc(client, alice_email)
    attachment_id = (await attach(client, doc_id, alice_email)).json()["id"]

    response = await client.delete(
        f"/api/v1/documents/{doc_id}/attachments/{attachment_id}",
        headers=auth_headers(alice_email),
    )

    assert response.status_code == 204
    # Gone from Storage as well as from the table — a row-only delete would
    # leave the bytes paid for and unreachable.
    assert fake_storage == {}
    listed = await client.get(
        f"/api/v1/documents/{doc_id}/attachments", headers=auth_headers(alice_email)
    )
    assert listed.json() == []


async def test_a_viewer_may_read_but_not_change(client, alice_email, bob_email, fake_storage):
    await ensure_user(client, bob_email)
    doc_id = await make_doc(client, alice_email)
    attachment_id = (await attach(client, doc_id, alice_email)).json()["id"]
    await share(client, doc_id, alice_email, bob_email, "view")

    listed = await client.get(
        f"/api/v1/documents/{doc_id}/attachments", headers=auth_headers(bob_email)
    )
    assert listed.status_code == 200

    url = await client.get(
        f"/api/v1/documents/{doc_id}/attachments/{attachment_id}/url",
        headers=auth_headers(bob_email),
    )
    assert url.status_code == 200

    # 404 rather than 403: a 403 would confirm the document exists to someone
    # who may only view it.
    assert (await attach(client, doc_id, bob_email)).status_code == 404
    assert (
        await client.delete(
            f"/api/v1/documents/{doc_id}/attachments/{attachment_id}",
            headers=auth_headers(bob_email),
        )
    ).status_code == 404


async def test_an_editor_may_change(client, alice_email, bob_email, fake_storage):
    await ensure_user(client, bob_email)
    doc_id = await make_doc(client, alice_email)
    await share(client, doc_id, alice_email, bob_email, "edit")

    assert (await attach(client, doc_id, bob_email)).status_code == 201


async def test_a_stranger_sees_nothing(client, alice_email, bob_email, fake_storage):
    doc_id = await make_doc(client, alice_email)
    attachment_id = (await attach(client, doc_id, alice_email)).json()["id"]

    for response in [
        await client.get(
            f"/api/v1/documents/{doc_id}/attachments", headers=auth_headers(bob_email)
        ),
        await client.get(
            f"/api/v1/documents/{doc_id}/attachments/{attachment_id}/url",
            headers=auth_headers(bob_email),
        ),
        await attach(client, doc_id, bob_email),
        await client.delete(
            f"/api/v1/documents/{doc_id}/attachments/{attachment_id}",
            headers=auth_headers(bob_email),
        ),
    ]:
        assert response.status_code == 404


async def test_an_attachment_from_another_document_is_not_reachable(
    client, alice_email, fake_storage
):
    """Both documents are Alice's, so this is not a permission question — it is
    whether the lookup is scoped. Unscoped, the id would load and be deleted."""
    mine = await make_doc(client, alice_email)
    other = await make_doc(client, alice_email)
    foreign_id = (await attach(client, other, alice_email)).json()["id"]

    assert (
        await client.get(
            f"/api/v1/documents/{mine}/attachments/{foreign_id}/url",
            headers=auth_headers(alice_email),
        )
    ).status_code == 404
    assert (
        await client.delete(
            f"/api/v1/documents/{mine}/attachments/{foreign_id}",
            headers=auth_headers(alice_email),
        )
    ).status_code == 404


async def test_a_disallowed_type_is_refused(client, alice_email, fake_storage):
    doc_id = await make_doc(client, alice_email)

    response = await attach(client, doc_id, alice_email, name="payload.exe", data=b"MZ")

    assert response.status_code == 422
    assert fake_storage == {}


async def test_svg_is_refused_although_it_is_an_image(client, alice_email, fake_storage):
    doc_id = await make_doc(client, alice_email)

    response = await attach(
        client, doc_id, alice_email, name="drawing.svg", data=b"<svg onload='x'/>"
    )

    assert response.status_code == 422


async def test_an_oversized_file_is_refused(client, alice_email, fake_storage):
    doc_id = await make_doc(client, alice_email)

    response = await attach(
        client, doc_id, alice_email, name="big.png", data=b"x" * (10 * 1024 * 1024 + 1)
    )

    assert response.status_code == 422
    assert fake_storage == {}


async def test_an_empty_file_is_refused(client, alice_email, fake_storage):
    doc_id = await make_doc(client, alice_email)

    assert (await attach(client, doc_id, alice_email, data=b"")).status_code == 422


async def test_the_type_is_not_taken_from_the_request(client, alice_email, fake_storage):
    """The uploader claims image/png for a .txt file. The extension decides."""
    doc_id = await make_doc(client, alice_email)

    response = await client.post(
        f"/api/v1/documents/{doc_id}/attachments",
        files={"file": ("notes.txt", b"hello", "image/png")},
        headers=auth_headers(alice_email),
    )

    assert response.json()["mime_type"] == "text/plain"


async def test_every_route_is_unavailable_without_a_key(
    client, alice_email, monkeypatch, fake_storage
):
    """503, not 404 and not 500: an unconfigured deployment is infrastructure,
    and must never be confused with "you may not see this file"."""
    doc_id = await make_doc(client, alice_email)
    attachment_id = (await attach(client, doc_id, alice_email)).json()["id"]

    monkeypatch.setattr(settings, "supabase_service_role_key", "")
    monkeypatch.setattr(storage, "upload", _unconfigured)
    monkeypatch.setattr(storage, "signed_url", _unconfigured)
    monkeypatch.setattr(storage, "remove", _unconfigured)

    assert (await attach(client, doc_id, alice_email)).status_code == 503
    assert (
        await client.get(
            f"/api/v1/documents/{doc_id}/attachments/{attachment_id}/url",
            headers=auth_headers(alice_email),
        )
    ).status_code == 503


async def _unconfigured(*args, **kwargs):
    raise storage.StorageUnavailableError("Attachments are not configured")


async def test_listing_still_works_without_a_key(client, alice_email, monkeypatch, fake_storage):
    """Listing reads the database and never touches Storage, so it keeps
    working — the UI can still say what is attached."""
    doc_id = await make_doc(client, alice_email)
    await attach(client, doc_id, alice_email)

    monkeypatch.setattr(settings, "supabase_service_role_key", "")

    response = await client.get(
        f"/api/v1/documents/{doc_id}/attachments", headers=auth_headers(alice_email)
    )
    assert response.status_code == 200


async def test_all_attachment_routes_require_authentication(client, alice_email, fake_storage):
    doc_id = await make_doc(client, alice_email)
    attachment_id = (await attach(client, doc_id, alice_email)).json()["id"]

    assert (await client.get(f"/api/v1/documents/{doc_id}/attachments")).status_code == 401
    assert (
        await client.get(f"/api/v1/documents/{doc_id}/attachments/{attachment_id}/url")
    ).status_code == 401
    assert (
        await client.delete(f"/api/v1/documents/{doc_id}/attachments/{attachment_id}")
    ).status_code == 401


# --- Phase 12: the raw redirect that makes inline images possible ---


async def test_the_raw_endpoint_redirects_to_a_signed_url(client, alice_email, fake_storage):
    """A signed URL expires in five minutes, so a document embedding one would
    render briefly and then be broken forever. This URL is stable and the
    signing happens per request."""
    doc_id = await make_doc(client, alice_email)
    attachment_id = (await attach(client, doc_id, alice_email)).json()["id"]

    response = await client.get(
        f"/api/v1/documents/{doc_id}/attachments/{attachment_id}/raw",
        headers=auth_headers(alice_email),
        follow_redirects=False,
    )

    assert response.status_code == 302
    assert response.headers["location"].startswith("https://storage.test/signed/")
    # Caching the redirect would hand out a link that has already expired.
    assert response.headers["cache-control"] == "no-store"


async def test_a_viewer_may_load_an_image(client, alice_email, bob_email, fake_storage):
    await ensure_user(client, bob_email)
    doc_id = await make_doc(client, alice_email)
    attachment_id = (await attach(client, doc_id, alice_email)).json()["id"]
    await share(client, doc_id, alice_email, bob_email, "view")

    response = await client.get(
        f"/api/v1/documents/{doc_id}/attachments/{attachment_id}/raw",
        headers=auth_headers(bob_email),
        follow_redirects=False,
    )

    assert response.status_code == 302


async def test_a_stranger_cannot_load_an_image(client, alice_email, bob_email, fake_storage):
    """The reason this is a redirect rather than a public bucket: access is
    checked on every request, so revoking a share revokes the images too."""
    doc_id = await make_doc(client, alice_email)
    attachment_id = (await attach(client, doc_id, alice_email)).json()["id"]

    response = await client.get(
        f"/api/v1/documents/{doc_id}/attachments/{attachment_id}/raw",
        headers=auth_headers(bob_email),
        follow_redirects=False,
    )

    assert response.status_code == 404


async def test_an_image_from_another_document_is_not_reachable(client, alice_email, fake_storage):
    mine = await make_doc(client, alice_email)
    other = await make_doc(client, alice_email)
    foreign = (await attach(client, other, alice_email)).json()["id"]

    response = await client.get(
        f"/api/v1/documents/{mine}/attachments/{foreign}/raw",
        headers=auth_headers(alice_email),
        follow_redirects=False,
    )

    assert response.status_code == 404


async def test_the_raw_endpoint_requires_authentication(client, alice_email, fake_storage):
    doc_id = await make_doc(client, alice_email)
    attachment_id = (await attach(client, doc_id, alice_email)).json()["id"]

    response = await client.get(
        f"/api/v1/documents/{doc_id}/attachments/{attachment_id}/raw",
        follow_redirects=False,
    )

    assert response.status_code == 401
