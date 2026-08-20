"""Duplicating a document, and marking one as a template."""

import uuid

import pytest
from httpx import AsyncClient

from app.services.duplication import copied_title, rewrite_attachment_references
from tests.conftest import auth_headers


@pytest.fixture
def owner_email() -> str:
    return f"owner-{uuid.uuid4()}@example.com"


@pytest.fixture
def friend_email() -> str:
    return f"friend-{uuid.uuid4()}@example.com"


def doc_with(text: str) -> dict:
    return {
        "type": "doc",
        "content": [{"type": "paragraph", "content": [{"type": "text", "text": text}]}],
    }


async def make_doc(client: AsyncClient, email: str, title="Original", body="Some prose") -> str:
    response = await client.post(
        "/api/v1/documents",
        json={"title": title, "content": doc_with(body)},
        headers=auth_headers(email),
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


async def duplicate(client: AsyncClient, doc_id: str, email: str, **params):
    return await client.post(
        f"/api/v1/documents/{doc_id}/duplicate",
        params=params,
        headers=auth_headers(email),
    )


async def share(client: AsyncClient, doc_id: str, owner: str, email: str, permission="view"):
    await client.get("/api/v1/me", headers=auth_headers(email))
    return await client.post(
        f"/api/v1/documents/{doc_id}/shares",
        json={"email": email, "permission": permission},
        headers=auth_headers(owner),
    )


def test_a_copied_title_says_so_and_stays_within_the_column():
    assert copied_title("Notes") == "Copy of Notes"

    long = copied_title("N" * 600)
    assert len(long) == 500
    assert long.startswith("Copy of ")


def test_rewriting_points_images_at_the_new_attachments():
    old, new = uuid.uuid4(), uuid.uuid4()
    content = {
        "type": "doc",
        "content": [
            {"type": "image", "attrs": {"src": f"/api/v1/documents/x/attachments/{old}/raw"}}
        ],
    }

    rewritten = rewrite_attachment_references(content, {old: new})

    assert str(new) in str(rewritten)
    assert str(old) not in str(rewritten)


def test_rewriting_nothing_leaves_the_content_alone():
    content = doc_with("untouched")

    assert rewrite_attachment_references(content, {}) == content


async def test_a_duplicate_carries_the_title_and_the_content(client, owner_email):
    doc_id = await make_doc(client, owner_email, title="Quarterly plan", body="The body")

    response = await duplicate(client, doc_id, owner_email)

    assert response.status_code == 201
    assert response.json()["title"] == "Copy of Quarterly plan"
    assert "The body" in str(response.json()["content"])


async def test_the_copy_is_a_separate_document(client, owner_email):
    doc_id = await make_doc(client, owner_email)
    copy_id = (await duplicate(client, doc_id, owner_email)).json()["id"]

    await client.patch(
        f"/api/v1/documents/{copy_id}",
        json={"content": doc_with("changed in the copy")},
        headers=auth_headers(owner_email),
    )

    original = (
        await client.get(f"/api/v1/documents/{doc_id}", headers=auth_headers(owner_email))
    ).json()
    assert "changed in the copy" not in str(original["content"])


async def test_anyone_who_can_see_a_document_can_copy_it(client, owner_email, friend_email):
    """They can already export it as Markdown and import the file back, which
    produces a worse copy through more steps."""
    doc_id = await make_doc(client, owner_email, title="Shared thing")
    await share(client, doc_id, owner_email, friend_email, "view")

    response = await duplicate(client, doc_id, friend_email)

    assert response.status_code == 201
    # And the copy belongs to the person who made it, not the original owner.
    listing = (await client.get("/api/v1/documents", headers=auth_headers(friend_email))).json()
    assert [d["title"] for d in listing["owned"]] == ["Copy of Shared thing"]


async def test_a_stranger_cannot_copy_what_they_cannot_see(client, owner_email, friend_email):
    doc_id = await make_doc(client, owner_email)

    response = await duplicate(client, doc_id, friend_email)

    assert response.status_code == 404


async def test_the_copy_is_not_shared_with_anyone(client, owner_email, friend_email):
    """A copy is not a re-share. Who sees it is the copier's decision, and
    inheriting it would hand a document to people they never chose."""
    doc_id = await make_doc(client, owner_email)
    await share(client, doc_id, owner_email, friend_email, "edit")

    copy_id = (await duplicate(client, doc_id, owner_email)).json()["id"]

    shares = (
        await client.get(
            f"/api/v1/documents/{copy_id}/shares", headers=auth_headers(owner_email)
        )
    ).json()
    assert shares == []


async def test_the_copy_carries_no_comments(client, owner_email):
    """A discussion is about the document it happened on."""
    doc_id = await make_doc(client, owner_email)
    await client.post(
        f"/api/v1/documents/{doc_id}/comments",
        json={"body": "A remark on the original"},
        headers=auth_headers(owner_email),
    )

    copy_id = (await duplicate(client, doc_id, owner_email)).json()["id"]

    comments = (
        await client.get(
            f"/api/v1/documents/{copy_id}/comments", headers=auth_headers(owner_email)
        )
    ).json()
    assert comments == []


async def test_the_copy_has_no_history(client, owner_email):
    """The copy has no past."""
    doc_id = await make_doc(client, owner_email)
    await client.patch(
        f"/api/v1/documents/{doc_id}",
        json={"content": doc_with("a second draft")},
        headers=auth_headers(owner_email),
    )

    copy_id = (await duplicate(client, doc_id, owner_email)).json()["id"]

    versions = (
        await client.get(
            f"/api/v1/documents/{copy_id}/versions", headers=auth_headers(owner_email)
        )
    ).json()
    assert versions == []


async def test_the_copy_is_not_starred(client, owner_email):
    """A star is a private bookmark, not a property of the document."""
    doc_id = await make_doc(client, owner_email)
    await client.put(f"/api/v1/documents/{doc_id}/star", headers=auth_headers(owner_email))

    copy_id = (await duplicate(client, doc_id, owner_email)).json()["id"]

    listing = (await client.get("/api/v1/documents", headers=auth_headers(owner_email))).json()
    [copy] = [d for d in listing["owned"] if d["id"] == copy_id]
    assert copy["starred"] is False


async def test_a_document_can_be_marked_a_template(client, owner_email):
    doc_id = await make_doc(client, owner_email)

    response = await client.patch(
        f"/api/v1/documents/{doc_id}",
        json={"is_template": True},
        headers=auth_headers(owner_email),
    )

    assert response.status_code == 200
    assert response.json()["is_template"] is True


async def test_only_the_owner_may_mark_a_template(client, owner_email, friend_email):
    """An editor may change what a document says; whether it is offered to
    everyone as a starting point is the owner's call."""
    doc_id = await make_doc(client, owner_email)
    await share(client, doc_id, owner_email, friend_email, "edit")

    response = await client.patch(
        f"/api/v1/documents/{doc_id}",
        json={"is_template": True},
        headers=auth_headers(friend_email),
    )

    assert response.status_code == 404


async def test_a_title_only_save_does_not_unmark_a_template(client, owner_email):
    """The folders lesson, in its third form: an omitted field means "leave it
    alone", never "set it to false"."""
    doc_id = await make_doc(client, owner_email)
    await client.patch(
        f"/api/v1/documents/{doc_id}",
        json={"is_template": True},
        headers=auth_headers(owner_email),
    )

    await client.patch(
        f"/api/v1/documents/{doc_id}",
        json={"title": "Renamed while editing"},
        headers=auth_headers(owner_email),
    )

    document = (
        await client.get(f"/api/v1/documents/{doc_id}", headers=auth_headers(owner_email))
    ).json()
    assert document["is_template"] is True


async def test_a_copy_of_a_template_is_not_a_template(client, owner_email):
    """Which is the entire point of using one."""
    doc_id = await make_doc(client, owner_email, title="Weekly update")
    await client.patch(
        f"/api/v1/documents/{doc_id}",
        json={"is_template": True},
        headers=auth_headers(owner_email),
    )

    copy = (await duplicate(client, doc_id, owner_email, as_copy=False)).json()

    assert copy["is_template"] is False
    # And under the template's own name, not "Copy of".
    assert copy["title"] == "Weekly update"


async def test_the_list_says_which_documents_are_templates(client, owner_email):
    doc_id = await make_doc(client, owner_email)
    await client.patch(
        f"/api/v1/documents/{doc_id}",
        json={"is_template": True},
        headers=auth_headers(owner_email),
    )

    listing = (await client.get("/api/v1/documents", headers=auth_headers(owner_email))).json()

    [item] = [d for d in listing["owned"] if d["id"] == doc_id]
    assert item["is_template"] is True


async def test_duplicating_requires_authentication(client, owner_email):
    doc_id = await make_doc(client, owner_email)

    assert (
        await client.post(f"/api/v1/documents/{doc_id}/duplicate")
    ).status_code == 401
