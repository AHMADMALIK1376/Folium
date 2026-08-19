"""Notifications and mentions."""

import uuid

import pytest
from httpx import AsyncClient

from tests.conftest import auth_headers


@pytest.fixture
def owner_email() -> str:
    return f"owner-{uuid.uuid4()}@example.com"


@pytest.fixture
def friend_email() -> str:
    return f"friend-{uuid.uuid4()}@example.com"


@pytest.fixture
def third_email() -> str:
    return f"third-{uuid.uuid4()}@example.com"


async def user_id(client: AsyncClient, email: str) -> str:
    return (await client.get("/api/v1/me", headers=auth_headers(email))).json()["id"]


async def make_doc(client: AsyncClient, email: str, title: str = "A document") -> str:
    response = await client.post(
        "/api/v1/documents",
        json={"title": title, "content": {"type": "doc", "content": []}},
        headers=auth_headers(email),
    )
    return response.json()["id"]


async def share(client: AsyncClient, doc_id: str, owner: str, email: str, permission="edit"):
    await user_id(client, email)
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


async def inbox(client: AsyncClient, email: str) -> list[dict]:
    response = await client.get("/api/v1/notifications", headers=auth_headers(email))
    assert response.status_code == 200, response.text
    return response.json()


async def unread(client: AsyncClient, email: str) -> int:
    response = await client.get("/api/v1/notifications/unread-count", headers=auth_headers(email))
    return response.json()["count"]


async def test_being_shared_a_document_is_news(client, owner_email, friend_email):
    doc_id = await make_doc(client, owner_email, "Shared with you")

    await share(client, doc_id, owner_email, friend_email)

    [note] = await inbox(client, friend_email)
    assert note["kind"] == "share"
    assert note["document_id"] == doc_id
    assert note["document_title"] == "Shared with you"
    assert note["actor_name"] is not None
    assert await unread(client, friend_email) == 1


async def test_changing_someones_level_is_not_a_second_notification(
    client, owner_email, friend_email
):
    """They already know the document exists. Telling them again is noise."""
    doc_id = await make_doc(client, owner_email)
    await share(client, doc_id, owner_email, friend_email, "view")

    await share(client, doc_id, owner_email, friend_email, "edit")

    assert len(await inbox(client, friend_email)) == 1


async def test_a_comment_reaches_the_owner(client, owner_email, friend_email):
    doc_id = await make_doc(client, owner_email)
    await share(client, doc_id, owner_email, friend_email, "comment")

    await comment(client, doc_id, friend_email, body="A question")

    kinds = [n["kind"] for n in await inbox(client, owner_email)]
    assert kinds == ["comment"]


async def test_nobody_is_notified_about_their_own_action(client, owner_email):
    """The rule most likely to be got wrong, and the most obviously wrong when
    it is."""
    doc_id = await make_doc(client, owner_email)

    root = (await comment(client, doc_id, owner_email)).json()
    await comment(client, doc_id, owner_email, parent_id=root["id"])
    await comment(client, doc_id, owner_email, mention_user_ids=[await user_id(client, owner_email)])

    assert await inbox(client, owner_email) == []
    assert await unread(client, owner_email) == 0


async def test_a_reply_reaches_the_person_it_answers(client, owner_email, friend_email):
    doc_id = await make_doc(client, owner_email)
    await share(client, doc_id, owner_email, friend_email, "comment")
    theirs = (await comment(client, doc_id, friend_email, body="A question")).json()

    await comment(client, doc_id, owner_email, body="An answer", parent_id=theirs["id"])

    kinds = [n["kind"] for n in await inbox(client, friend_email)]
    # The share, and the reply. Not a comment notification as well.
    assert kinds == ["reply", "share"]


async def test_a_mention_beats_a_reply_for_the_same_person(client, owner_email, friend_email):
    """One event, one notification. "Ada mentioned you" says everything "Ada
    replied" says and more, so the more specific kind wins."""
    doc_id = await make_doc(client, owner_email)
    await share(client, doc_id, owner_email, friend_email, "comment")
    theirs = (await comment(client, doc_id, friend_email, body="A question")).json()

    await comment(
        client,
        doc_id,
        owner_email,
        body="An answer for you",
        parent_id=theirs["id"],
        mention_user_ids=[await user_id(client, friend_email)],
    )

    kinds = [n["kind"] for n in await inbox(client, friend_email)]
    assert kinds == ["mention", "share"]


async def test_a_mention_reaches_someone_who_is_not_the_owner(
    client, owner_email, friend_email, third_email
):
    doc_id = await make_doc(client, owner_email)
    await share(client, doc_id, owner_email, friend_email, "comment")
    await share(client, doc_id, owner_email, third_email, "view")

    await comment(
        client,
        doc_id,
        friend_email,
        body="What do you think?",
        mention_user_ids=[await user_id(client, third_email)],
    )

    assert [n["kind"] for n in await inbox(client, third_email)] == ["mention", "share"]
    # And the owner still hears about the comment itself.
    assert [n["kind"] for n in await inbox(client, owner_email)] == ["comment"]


async def test_mentioning_someone_without_access_is_refused(
    client, owner_email, friend_email, third_email
):
    """Refused rather than silently dropped: a dropped mention is a message the
    sender believes they sent."""
    doc_id = await make_doc(client, owner_email)
    stranger = await user_id(client, third_email)

    response = await comment(client, doc_id, owner_email, mention_user_ids=[stranger])

    assert response.status_code == 422
    # And no comment was written either — the whole request failed.
    listed = await client.get(
        f"/api/v1/documents/{doc_id}/comments", headers=auth_headers(owner_email)
    )
    assert listed.json() == []


async def test_a_notification_does_not_outlive_the_access_it_was_made_under(
    client, owner_email, friend_email
):
    """The rule that makes this safe. The row still holds a document title."""
    doc_id = await make_doc(client, owner_email, "Confidential")
    await share(client, doc_id, owner_email, friend_email, "comment")
    await comment(client, doc_id, owner_email, body="Something")
    assert len(await inbox(client, friend_email)) >= 1

    friend_id = await user_id(client, friend_email)
    await client.delete(
        f"/api/v1/documents/{doc_id}/shares/{friend_id}", headers=auth_headers(owner_email)
    )

    assert await inbox(client, friend_email) == []
    assert await unread(client, friend_email) == 0


async def test_a_trashed_document_takes_its_notifications_out_of_sight(
    client, owner_email, friend_email
):
    doc_id = await make_doc(client, owner_email)
    await share(client, doc_id, owner_email, friend_email, "comment")
    await comment(client, doc_id, friend_email)
    assert len(await inbox(client, owner_email)) == 1

    await client.delete(f"/api/v1/documents/{doc_id}", headers=auth_headers(owner_email))

    assert await inbox(client, owner_email) == []


async def test_deleting_a_comment_takes_its_notification_with_it(
    client, owner_email, friend_email
):
    """A notification pointing at a deleted comment promises something to look
    at and delivers a 404."""
    doc_id = await make_doc(client, owner_email)
    await share(client, doc_id, owner_email, friend_email, "comment")
    made = (await comment(client, doc_id, friend_email)).json()
    assert len(await inbox(client, owner_email)) == 1

    await client.delete(
        f"/api/v1/documents/{doc_id}/comments/{made['id']}", headers=auth_headers(owner_email)
    )

    assert await inbox(client, owner_email) == []


async def test_marking_everything_read(client, owner_email, friend_email):
    doc_id = await make_doc(client, owner_email)
    await share(client, doc_id, owner_email, friend_email, "comment")
    await comment(client, doc_id, friend_email)
    await comment(client, doc_id, friend_email)
    assert await unread(client, owner_email) == 2

    response = await client.post(
        "/api/v1/notifications/read", json={}, headers=auth_headers(owner_email)
    )

    assert response.status_code == 200
    assert response.json()["count"] == 0
    assert all(n["read_at"] is not None for n in await inbox(client, owner_email))


async def test_marking_one_read_leaves_the_others(client, owner_email, friend_email):
    doc_id = await make_doc(client, owner_email)
    await share(client, doc_id, owner_email, friend_email, "comment")
    await comment(client, doc_id, friend_email)
    await comment(client, doc_id, friend_email)
    first = (await inbox(client, owner_email))[0]["id"]

    response = await client.post(
        "/api/v1/notifications/read", json={"ids": [first]}, headers=auth_headers(owner_email)
    )

    assert response.json()["count"] == 1


async def test_someone_elses_id_is_ignored_rather_than_refused(
    client, owner_email, friend_email
):
    """A partial batch is not an error, and saying which ids were not theirs
    would confirm those ids exist."""
    doc_id = await make_doc(client, owner_email)
    await share(client, doc_id, owner_email, friend_email, "comment")
    await comment(client, doc_id, friend_email)
    theirs = (await inbox(client, friend_email))[0]["id"]

    response = await client.post(
        "/api/v1/notifications/read", json={"ids": [theirs]}, headers=auth_headers(owner_email)
    )

    assert response.status_code == 200
    # Nothing of the owner's was marked, and nothing of the friend's either.
    assert response.json()["count"] == 1
    assert await unread(client, friend_email) == 1


async def test_an_empty_id_list_marks_nothing(client, owner_email, friend_email):
    """`ids: []` and no ids at all are different requests, which is why the
    schema defaults to None rather than an empty list."""
    doc_id = await make_doc(client, owner_email)
    await share(client, doc_id, owner_email, friend_email, "comment")
    await comment(client, doc_id, friend_email)

    response = await client.post(
        "/api/v1/notifications/read", json={"ids": []}, headers=auth_headers(owner_email)
    )

    assert response.json()["count"] == 1


async def test_notification_routes_require_authentication(client):
    assert (await client.get("/api/v1/notifications")).status_code == 401
    assert (await client.get("/api/v1/notifications/unread-count")).status_code == 401
    assert (await client.post("/api/v1/notifications/read", json={})).status_code == 401
