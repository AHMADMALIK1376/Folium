"""Searching documents by title and body."""

import uuid

import pytest
from httpx import AsyncClient

from app.services.search import normalise_query, snippet_for
from tests.conftest import auth_headers


@pytest.fixture
def alice_email() -> str:
    return f"alice-{uuid.uuid4()}@example.com"


@pytest.fixture
def bob_email() -> str:
    return f"bob-{uuid.uuid4()}@example.com"


def body(*paragraphs: str) -> dict:
    return {
        "type": "doc",
        "content": [
            {"type": "paragraph", "content": [{"type": "text", "text": p}]}
            for p in paragraphs
        ],
    }


async def make_doc(client: AsyncClient, email: str, title: str, *paragraphs: str) -> str:
    response = await client.post(
        "/api/v1/documents",
        json={"title": title, "content": body(*paragraphs)},
        headers=auth_headers(email),
    )
    return response.json()["id"]


async def find(client: AsyncClient, email: str, query: str) -> list[dict]:
    response = await client.get(
        "/api/v1/documents/search", params={"q": query}, headers=auth_headers(email)
    )
    assert response.status_code == 200, response.text
    return response.json()["results"]


# --- pure helpers ---


def test_a_blank_or_tiny_query_does_not_run():
    """An empty search box is not a request for the whole account, and one
    letter matches most of it while costing a round trip."""
    assert normalise_query("") == ""
    assert normalise_query("   ") == ""
    assert normalise_query("a") == ""
    assert normalise_query(" ab ") == "ab"


def test_a_snippet_is_bounded_and_centred_on_the_match():
    text = "alpha " * 60 + "NEEDLE " + "omega " * 60

    snippet = snippet_for(text, "needle")

    assert "NEEDLE" in snippet
    assert len(snippet) < 200


def test_a_snippet_of_an_empty_body_is_empty():
    assert snippet_for("", "anything") == ""


def test_a_snippet_falls_back_to_the_opening_when_the_match_is_in_the_title():
    snippet = snippet_for("The body never mentions it.", "titleword")

    assert snippet.startswith("The body")


# --- the API ---


async def test_a_document_is_found_by_a_word_in_its_body(client, alice_email):
    marker = f"zebracrossing{uuid.uuid4().hex[:8]}"
    doc_id = await make_doc(client, alice_email, "Untitled", f"Something about {marker} here")

    results = await find(client, alice_email, marker)

    assert [r["id"] for r in results] == [doc_id]
    assert marker in results[0]["snippet"]


async def test_a_document_is_found_by_its_title(client, alice_email):
    marker = f"quarterlyplan{uuid.uuid4().hex[:8]}"
    doc_id = await make_doc(client, alice_email, f"The {marker}", "Body text")

    assert [r["id"] for r in await find(client, alice_email, marker)] == [doc_id]


async def test_a_title_match_outranks_a_body_match(client, alice_email):
    """If the words are in the title, that is the document."""
    marker = f"ranking{uuid.uuid4().hex[:8]}"
    in_body = await make_doc(client, alice_email, "Some other document", f"mentions {marker}")
    in_title = await make_doc(client, alice_email, f"About {marker}", "unrelated body")

    results = await find(client, alice_email, marker)

    assert [r["id"] for r in results][:2] == [in_title, in_body]


async def test_the_trash_is_not_an_answer(client, alice_email):
    marker = f"deleted{uuid.uuid4().hex[:8]}"
    doc_id = await make_doc(client, alice_email, f"About {marker}", "body")
    await client.delete(f"/api/v1/documents/{doc_id}", headers=auth_headers(alice_email))

    assert await find(client, alice_email, marker) == []


async def test_another_persons_documents_are_never_returned(client, alice_email, bob_email):
    marker = f"private{uuid.uuid4().hex[:8]}"
    await make_doc(client, alice_email, f"Alice's {marker}", "secret body")

    assert await find(client, bob_email, marker) == []


async def test_a_shared_document_is_searchable_by_the_collaborator(
    client, alice_email, bob_email
):
    await client.get("/api/v1/me", headers=auth_headers(bob_email))
    marker = f"shared{uuid.uuid4().hex[:8]}"
    doc_id = await make_doc(client, alice_email, f"About {marker}", "body")
    await client.post(
        f"/api/v1/documents/{doc_id}/shares",
        json={"email": bob_email, "permission": "view"},
        headers=auth_headers(alice_email),
    )

    results = await find(client, bob_email, marker)

    assert [r["id"] for r in results] == [doc_id]
    # And it is marked as somebody else's, so the dashboard can say so.
    assert results[0]["owned"] is False


async def test_a_blank_query_returns_nothing_rather_than_everything(client, alice_email):
    await make_doc(client, alice_email, "Something", "anything")

    assert await find(client, alice_email, "") == []
    assert await find(client, alice_email, "   ") == []


async def test_a_malformed_query_does_not_error(client, alice_email):
    """The test worth having. Raw user input goes into a query language, and
    to_tsquery raises a syntax error on a stray operator — which would turn a
    half-typed search into a 500. websearch_to_tsquery tolerates all of these.
    """
    for query in ['" unclosed', "&&&", "| or", "a & b", "!!!", "-", "()", "'quote", "a:*"]:
        response = await client.get(
            "/api/v1/documents/search", params={"q": query}, headers=auth_headers(alice_email)
        )
        assert response.status_code == 200, f"{query!r} produced {response.status_code}"


async def test_a_quoted_phrase_is_honoured(client, alice_email):
    marker = uuid.uuid4().hex[:8]
    await make_doc(client, alice_email, "Doc A", f"northern {marker} region")
    await make_doc(client, alice_email, "Doc B", f"{marker} region northern")

    both = await find(client, alice_email, marker)
    phrase = await find(client, alice_email, f'"northern {marker} region"')

    assert len(both) == 2
    assert len(phrase) == 1


async def test_an_overlong_query_is_refused_rather_than_parsed(client, alice_email):
    response = await client.get(
        "/api/v1/documents/search",
        params={"q": "x" * 500},
        headers=auth_headers(alice_email),
    )

    assert response.status_code == 422


async def test_search_requires_authentication(client):
    assert (await client.get("/api/v1/documents/search", params={"q": "anything"})).status_code == 401
