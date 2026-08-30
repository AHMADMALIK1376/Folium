"""Page size, orientation and margins: stored, validated, and carried on a copy.

The column is jsonb, which enforces nothing. Everything that keeps a document
from rendering at four hundred inches wide lives in app/schemas/page_setup.py,
so most of what is worth testing here is what gets *refused*.
"""

import uuid

import pytest
from httpx import AsyncClient

from tests.conftest import auth_headers


@pytest.fixture
def owner_email() -> str:
    return f"pageowner-{uuid.uuid4()}@example.com"


@pytest.fixture
def friend_email() -> str:
    return f"pagefriend-{uuid.uuid4()}@example.com"


def doc_with(text: str) -> dict:
    return {
        "type": "doc",
        "content": [{"type": "paragraph", "content": [{"type": "text", "text": text}]}],
    }


async def make_doc(client: AsyncClient, email: str, title: str = "Paper") -> str:
    response = await client.post(
        "/api/v1/documents",
        json={"title": title, "content": doc_with("Body")},
        headers=auth_headers(email),
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


async def ensure_user(client: AsyncClient, email: str) -> None:
    """Give the address an account.

    Sharing needs one -- there are no pending invitations -- so without this the
    share is refused and the test reads as a permissions failure instead of a
    missing account.
    """
    await client.get("/api/v1/me", headers=auth_headers(email))


NORMAL = {
    "size": "letter",
    "orientation": "landscape",
    "margins": {"top": 0.5, "right": 0.5, "bottom": 0.5, "left": 0.5},
}


async def test_a_new_document_has_no_page_setup(client: AsyncClient, owner_email: str):
    """None, not a default written into the row.

    The distinction matters: a document deliberately set to A4 and one that
    simply predates the feature are different things, and only one of them
    should stay in step if the application's default ever changes.
    """
    doc_id = await make_doc(client, owner_email)

    response = await client.get(f"/api/v1/documents/{doc_id}", headers=auth_headers(owner_email))

    assert response.status_code == 200
    assert response.json()["page_setup"] is None


async def test_page_setup_is_saved_and_returned(client: AsyncClient, owner_email: str):
    doc_id = await make_doc(client, owner_email)

    response = await client.patch(
        f"/api/v1/documents/{doc_id}",
        json={"page_setup": NORMAL},
        headers=auth_headers(owner_email),
    )

    assert response.status_code == 200, response.text
    assert response.json()["page_setup"] == NORMAL

    # And it is on the row, not merely echoed back.
    again = await client.get(f"/api/v1/documents/{doc_id}", headers=auth_headers(owner_email))
    assert again.json()["page_setup"] == NORMAL


async def test_page_setup_survives_a_content_only_save(client: AsyncClient, owner_email: str):
    """The autosave trap, and the reason this rides `model_fields_set`.

    Every keystroke sends a content PATCH with no page_setup key. Treating that
    absence as "set it to None" would reset the page every time anyone typed.
    """
    doc_id = await make_doc(client, owner_email)
    await client.patch(
        f"/api/v1/documents/{doc_id}",
        json={"page_setup": NORMAL},
        headers=auth_headers(owner_email),
    )

    await client.patch(
        f"/api/v1/documents/{doc_id}",
        json={"content": doc_with("Typed some more")},
        headers=auth_headers(owner_email),
    )

    response = await client.get(f"/api/v1/documents/{doc_id}", headers=auth_headers(owner_email))
    assert response.json()["page_setup"] == NORMAL


async def test_page_setup_can_be_returned_to_the_defaults(client: AsyncClient, owner_email: str):
    """Explicit null is meaningful, and distinguishable from omission above."""
    doc_id = await make_doc(client, owner_email)
    await client.patch(
        f"/api/v1/documents/{doc_id}",
        json={"page_setup": NORMAL},
        headers=auth_headers(owner_email),
    )

    response = await client.patch(
        f"/api/v1/documents/{doc_id}",
        json={"page_setup": None},
        headers=auth_headers(owner_email),
    )

    assert response.status_code == 200
    assert response.json()["page_setup"] is None


@pytest.mark.parametrize(
    "setup",
    [
        pytest.param({"size": "a3"}, id="unknown page size"),
        pytest.param({"orientation": "sideways"}, id="unknown orientation"),
        pytest.param({"margins": {"top": 9}}, id="margin beyond the page"),
        pytest.param({"margins": {"top": -1}}, id="negative margin"),
        pytest.param({"margins": {"topp": 1}}, id="misspelled margin key"),
        pytest.param({"sixe": "a4"}, id="misspelled setting key"),
    ],
)
async def test_nonsense_page_setup_is_refused(
    client: AsyncClient, owner_email: str, setup: dict
):
    """A misspelled key in a jsonb column is otherwise invisible.

    It saves, it round-trips, and the setting it was meant to change simply
    never applies. `extra="forbid"` is what turns that into a 422 someone can
    see, which is why the two misspelling cases are here alongside the
    out-of-range ones.
    """
    doc_id = await make_doc(client, owner_email)

    response = await client.patch(
        f"/api/v1/documents/{doc_id}",
        json={"page_setup": setup},
        headers=auth_headers(owner_email),
    )

    assert response.status_code == 422, response.text


async def test_an_editor_may_change_the_page(
    client: AsyncClient, owner_email: str, friend_email: str
):
    """Deliberately unlike folder_id and is_template, which are owner-only.

    Those are organisation. Page size and margins are formatting -- the same
    kind of decision as alignment -- and an editor already makes those.
    """
    await ensure_user(client, friend_email)
    doc_id = await make_doc(client, owner_email)
    await client.post(
        f"/api/v1/documents/{doc_id}/shares",
        json={"email": friend_email, "permission": "edit"},
        headers=auth_headers(owner_email),
    )

    response = await client.patch(
        f"/api/v1/documents/{doc_id}",
        json={"page_setup": NORMAL},
        headers=auth_headers(friend_email),
    )

    assert response.status_code == 200, response.text
    assert response.json()["page_setup"] == NORMAL


async def test_a_viewer_may_not_change_the_page(
    client: AsyncClient, owner_email: str, friend_email: str
):
    await ensure_user(client, friend_email)
    doc_id = await make_doc(client, owner_email)
    await client.post(
        f"/api/v1/documents/{doc_id}/shares",
        json={"email": friend_email, "permission": "view"},
        headers=auth_headers(owner_email),
    )

    response = await client.patch(
        f"/api/v1/documents/{doc_id}",
        json={"page_setup": NORMAL},
        headers=auth_headers(friend_email),
    )

    assert response.status_code == 404


async def test_a_duplicate_keeps_the_page_setup(client: AsyncClient, owner_email: str):
    """Formatting travels with a copy; organisation does not.

    A template whose margins do not survive being used is a template that does
    not work.
    """
    doc_id = await make_doc(client, owner_email)
    await client.patch(
        f"/api/v1/documents/{doc_id}",
        json={"page_setup": NORMAL},
        headers=auth_headers(owner_email),
    )

    response = await client.post(
        f"/api/v1/documents/{doc_id}/duplicate", headers=auth_headers(owner_email)
    )

    assert response.status_code == 201, response.text
    assert response.json()["page_setup"] == NORMAL


async def test_a_partial_page_setup_is_filled_in(client: AsyncClient, owner_email: str):
    """Sending only what changed is legitimate; the rest takes the defaults.

    The stored value is always complete, so no reader has to know which fields
    the writer happened to send.
    """
    doc_id = await make_doc(client, owner_email)

    response = await client.patch(
        f"/api/v1/documents/{doc_id}",
        json={"page_setup": {"size": "legal"}},
        headers=auth_headers(owner_email),
    )

    assert response.status_code == 200, response.text
    assert response.json()["page_setup"] == {
        "size": "legal",
        "orientation": "portrait",
        "margins": {"top": 1.0, "right": 1.0, "bottom": 1.0, "left": 1.0},
    }
