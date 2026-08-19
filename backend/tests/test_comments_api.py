"""Comments, and the permission that has meant nothing since Phase 1."""

import uuid

import pytest
from httpx import AsyncClient

from tests.conftest import auth_headers


@pytest.fixture
def owner_email() -> str:
    return f"owner-{uuid.uuid4()}@example.com"


@pytest.fixture
def commenter_email() -> str:
    return f"commenter-{uuid.uuid4()}@example.com"


@pytest.fixture
def viewer_email() -> str:
    return f"viewer-{uuid.uuid4()}@example.com"


async def make_doc(client: AsyncClient, email: str, title: str = "A document") -> str:
    response = await client.post(
        "/api/v1/documents",
        json={"title": title, "content": {"type": "doc", "content": []}},
        headers=auth_headers(email),
    )
    return response.json()["id"]


async def share(client: AsyncClient, doc_id: str, owner: str, email: str, permission: str):
    # The invitee must exist: sharing resolves an address to an account.
    await client.get("/api/v1/me", headers=auth_headers(email))
    return await client.post(
        f"/api/v1/documents/{doc_id}/shares",
        json={"email": email, "permission": permission},
        headers=auth_headers(owner),
    )


async def comment(client: AsyncClient, doc_id: str, email: str, **body):
    return await client.post(
        f"/api/v1/documents/{doc_id}/comments",
        json={"body": "A remark", **body},
        headers=auth_headers(email),
    )


async def threads(client: AsyncClient, doc_id: str, email: str) -> list[dict]:
    response = await client.get(
        f"/api/v1/documents/{doc_id}/comments", headers=auth_headers(email)
    )
    assert response.status_code == 200, response.text
    return response.json()


async def test_an_owner_can_comment_on_their_own_document(client, owner_email):
    doc_id = await make_doc(client, owner_email)

    response = await comment(client, doc_id, owner_email, body="First")

    assert response.status_code == 201
    assert response.json()["body"] == "First"
    assert response.json()["author_name"] is not None


async def test_a_commenter_can_comment_but_not_edit_the_document(
    client, owner_email, commenter_email
):
    """The whole point of the phase. `comment` has existed since Phase 1 and has
    never let anyone do anything."""
    doc_id = await make_doc(client, owner_email)
    await share(client, doc_id, owner_email, commenter_email, "comment")

    assert (await comment(client, doc_id, commenter_email)).status_code == 201

    edit = await client.patch(
        f"/api/v1/documents/{doc_id}",
        json={"title": "Renamed by a commenter"},
        headers=auth_headers(commenter_email),
    )
    assert edit.status_code == 404


async def test_a_viewer_can_read_comments_but_not_write_one(
    client, owner_email, viewer_email
):
    doc_id = await make_doc(client, owner_email)
    await comment(client, doc_id, owner_email, body="Visible to a viewer")
    await share(client, doc_id, owner_email, viewer_email, "view")

    assert len(await threads(client, doc_id, viewer_email)) == 1

    # 403, not 404: the viewer already knows the document exists, so refusing
    # by name reveals nothing. 404 is for things they may not know exist.
    assert (await comment(client, doc_id, viewer_email)).status_code == 403


async def test_a_stranger_sees_nothing_at_all(client, owner_email, viewer_email):
    doc_id = await make_doc(client, owner_email)
    await comment(client, doc_id, owner_email)

    listed = await client.get(
        f"/api/v1/documents/{doc_id}/comments", headers=auth_headers(viewer_email)
    )

    # 404, not 403: a comment's existence is as sensitive as its document's.
    assert listed.status_code == 404
    assert (await comment(client, doc_id, viewer_email)).status_code == 404


async def test_a_comment_can_quote_a_passage(client, owner_email):
    doc_id = await make_doc(client, owner_email)

    response = await comment(
        client,
        doc_id,
        owner_email,
        body="Is this right?",
        quote="the budget constraint",
        prefix="honest about ",
        suffix=" and what it cost",
    )

    assert response.status_code == 201
    body = response.json()
    assert body["quote"] == "the budget constraint"
    assert body["prefix"] == "honest about "
    assert body["suffix"] == " and what it cost"


async def test_context_without_a_quote_is_not_kept(client, owner_email):
    """It anchors nothing. Storing it would imply an anchor that does not exist."""
    doc_id = await make_doc(client, owner_email)

    response = await comment(client, doc_id, owner_email, prefix="stray", suffix="stray")

    assert response.json()["quote"] is None
    assert response.json()["prefix"] is None
    assert response.json()["suffix"] is None


async def test_nothing_about_commenting_changes_the_document(client, owner_email):
    """The reason the anchor is a quote and not a mark. A mark would be a
    content write, and the `comment` permission exists for someone who may not
    write content."""
    doc_id = await make_doc(client, owner_email)
    before = (
        await client.get(f"/api/v1/documents/{doc_id}", headers=auth_headers(owner_email))
    ).json()

    await comment(client, doc_id, owner_email, quote="something")

    after = (
        await client.get(f"/api/v1/documents/{doc_id}", headers=auth_headers(owner_email))
    ).json()
    assert after["content"] == before["content"]
    assert after["updated_at"] == before["updated_at"]


async def test_replies_hang_off_their_thread(client, owner_email, commenter_email):
    doc_id = await make_doc(client, owner_email)
    await share(client, doc_id, owner_email, commenter_email, "comment")
    root = (await comment(client, doc_id, owner_email, body="What about this?")).json()

    reply = await comment(
        client, doc_id, commenter_email, body="Good point", parent_id=root["id"]
    )

    assert reply.status_code == 201
    listed = await threads(client, doc_id, owner_email)
    assert len(listed) == 1
    assert [r["body"] for r in listed[0]["replies"]] == ["Good point"]


async def test_a_reply_cannot_have_a_reply(client, owner_email):
    doc_id = await make_doc(client, owner_email)
    root = (await comment(client, doc_id, owner_email)).json()
    reply = (await comment(client, doc_id, owner_email, parent_id=root["id"])).json()

    response = await comment(client, doc_id, owner_email, parent_id=reply["id"])

    assert response.status_code == 422


async def test_a_reply_cannot_quote_a_passage_of_its_own(client, owner_email):
    """The anchor belongs to the thread. A reply pointing elsewhere would be a
    different conversation wearing this one's clothes."""
    doc_id = await make_doc(client, owner_email)
    root = (await comment(client, doc_id, owner_email)).json()

    response = await comment(
        client, doc_id, owner_email, parent_id=root["id"], quote="somewhere else"
    )

    assert response.status_code == 422


async def test_only_the_author_can_edit_a_comment(client, owner_email, commenter_email):
    """The owner may delete a comment — it is their document — but never rewrite
    one. Changing someone's words while their name stays on them is forgery."""
    doc_id = await make_doc(client, owner_email)
    await share(client, doc_id, owner_email, commenter_email, "comment")
    made = (await comment(client, doc_id, commenter_email, body="Mine")).json()

    by_owner = await client.patch(
        f"/api/v1/documents/{doc_id}/comments/{made['id']}",
        json={"body": "Words the owner put in their mouth"},
        headers=auth_headers(owner_email),
    )
    assert by_owner.status_code == 403

    by_author = await client.patch(
        f"/api/v1/documents/{doc_id}/comments/{made['id']}",
        json={"body": "Mine, revised"},
        headers=auth_headers(commenter_email),
    )
    assert by_author.status_code == 200
    assert by_author.json()["body"] == "Mine, revised"


async def test_the_owner_can_delete_someone_elses_comment(
    client, owner_email, commenter_email
):
    doc_id = await make_doc(client, owner_email)
    await share(client, doc_id, owner_email, commenter_email, "comment")
    made = (await comment(client, doc_id, commenter_email)).json()

    response = await client.delete(
        f"/api/v1/documents/{doc_id}/comments/{made['id']}", headers=auth_headers(owner_email)
    )

    assert response.status_code == 204
    assert await threads(client, doc_id, owner_email) == []


async def test_a_commenter_cannot_delete_someone_elses_comment(
    client, owner_email, commenter_email
):
    doc_id = await make_doc(client, owner_email)
    await share(client, doc_id, owner_email, commenter_email, "comment")
    made = (await comment(client, doc_id, owner_email)).json()

    response = await client.delete(
        f"/api/v1/documents/{doc_id}/comments/{made['id']}",
        headers=auth_headers(commenter_email),
    )

    assert response.status_code == 403


async def test_deleting_a_thread_deletes_its_replies(client, owner_email):
    """Unlike a folder, whose documents must survive it. A reply without the
    comment it answers is meaningless."""
    doc_id = await make_doc(client, owner_email)
    root = (await comment(client, doc_id, owner_email)).json()
    await comment(client, doc_id, owner_email, parent_id=root["id"])

    await client.delete(
        f"/api/v1/documents/{doc_id}/comments/{root['id']}", headers=auth_headers(owner_email)
    )

    assert await threads(client, doc_id, owner_email) == []


async def test_a_thread_can_be_resolved_and_reopened(client, owner_email, commenter_email):
    doc_id = await make_doc(client, owner_email)
    await share(client, doc_id, owner_email, commenter_email, "comment")
    root = (await comment(client, doc_id, owner_email)).json()
    url = f"/api/v1/documents/{doc_id}/comments/{root['id']}"

    resolved = await client.patch(
        url, json={"resolved": True}, headers=auth_headers(commenter_email)
    )
    assert resolved.status_code == 200
    assert resolved.json()["resolved_at"] is not None
    assert resolved.json()["resolved_by"] is not None

    # False, not omitted — which is exactly why the schema uses
    # model_fields_set. A None check would make reopening inexpressible.
    reopened = await client.patch(
        url, json={"resolved": False}, headers=auth_headers(owner_email)
    )
    assert reopened.status_code == 200
    assert reopened.json()["resolved_at"] is None
    assert reopened.json()["resolved_by"] is None


async def test_a_viewer_cannot_resolve(client, owner_email, viewer_email):
    doc_id = await make_doc(client, owner_email)
    await share(client, doc_id, owner_email, viewer_email, "view")
    root = (await comment(client, doc_id, owner_email)).json()

    response = await client.patch(
        f"/api/v1/documents/{doc_id}/comments/{root['id']}",
        json={"resolved": True},
        headers=auth_headers(viewer_email),
    )

    assert response.status_code == 403


async def test_a_reply_cannot_be_resolved(client, owner_email):
    """Resolving is a property of the thread, and the thread is its root."""
    doc_id = await make_doc(client, owner_email)
    root = (await comment(client, doc_id, owner_email)).json()
    reply = (await comment(client, doc_id, owner_email, parent_id=root["id"])).json()

    response = await client.patch(
        f"/api/v1/documents/{doc_id}/comments/{reply['id']}",
        json={"resolved": True},
        headers=auth_headers(owner_email),
    )

    assert response.status_code == 422


async def test_a_body_only_edit_does_not_reopen_a_resolved_thread(client, owner_email):
    """The folders lesson, in its second form: an omitted field must mean
    "leave it alone", never "set it to false"."""
    doc_id = await make_doc(client, owner_email)
    root = (await comment(client, doc_id, owner_email)).json()
    url = f"/api/v1/documents/{doc_id}/comments/{root['id']}"
    await client.patch(url, json={"resolved": True}, headers=auth_headers(owner_email))

    edited = await client.patch(
        url, json={"body": "Rephrased"}, headers=auth_headers(owner_email)
    )

    assert edited.json()["resolved_at"] is not None


async def test_a_comment_needs_something_in_it(client, owner_email):
    doc_id = await make_doc(client, owner_email)

    for blank in ["", "   ", "\n"]:
        assert (await comment(client, doc_id, owner_email, body=blank)).status_code == 422


async def test_a_comment_cannot_be_reached_through_another_document(client, owner_email):
    """Otherwise anyone with a document of their own could reach any comment in
    the system by putting their id in the path."""
    theirs = await make_doc(client, owner_email, "Theirs")
    mine = await make_doc(client, owner_email, "Mine")
    made = (await comment(client, theirs, owner_email)).json()

    response = await client.delete(
        f"/api/v1/documents/{mine}/comments/{made['id']}", headers=auth_headers(owner_email)
    )

    assert response.status_code == 404


async def test_comment_routes_require_authentication(client, owner_email):
    doc_id = await make_doc(client, owner_email)

    assert (await client.get(f"/api/v1/documents/{doc_id}/comments")).status_code == 401
    assert (
        await client.post(f"/api/v1/documents/{doc_id}/comments", json={"body": "x"})
    ).status_code == 401
