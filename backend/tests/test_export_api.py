import uuid

import pytest
from httpx import AsyncClient

from app.api.v1.export import content_disposition, safe_filename
from tests.conftest import auth_headers


@pytest.fixture
def alice_email() -> str:
    return f"alice-{uuid.uuid4()}@example.com"


@pytest.fixture
def bob_email() -> str:
    return f"bob-{uuid.uuid4()}@example.com"


def doc_content(text: str) -> dict:
    return {
        "type": "doc",
        "content": [
            {"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": text}]}
        ],
    }


async def ensure_user(client: AsyncClient, email: str) -> None:
    await client.get("/api/v1/me", headers=auth_headers(email))


async def make_doc(client: AsyncClient, email: str, title: str = "Quarterly plan") -> str:
    response = await client.post(
        "/api/v1/documents",
        json={"title": title, "content": doc_content("A heading")},
        headers=auth_headers(email),
    )
    return response.json()["id"]


async def test_a_document_exports_as_markdown(client: AsyncClient, alice_email):
    doc_id = await make_doc(client, alice_email)

    response = await client.get(
        f"/api/v1/documents/{doc_id}/export?format=markdown", headers=auth_headers(alice_email)
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/markdown")
    assert "# A heading" in response.text


async def test_it_downloads_rather_than_rendering(client: AsyncClient, alice_email):
    doc_id = await make_doc(client, alice_email)

    response = await client.get(
        f"/api/v1/documents/{doc_id}/export?format=markdown", headers=auth_headers(alice_email)
    )

    disposition = response.headers["content-disposition"]
    assert disposition.startswith("attachment")
    assert "Quarterly-plan.md" in disposition


async def test_a_viewer_may_export(client: AsyncClient, alice_email, bob_email):
    """Exporting is reading.

    A collaborator can already see every word on screen, so a copy they can keep
    discloses nothing further.
    """
    await ensure_user(client, bob_email)
    doc_id = await make_doc(client, alice_email)
    await client.post(
        f"/api/v1/documents/{doc_id}/shares",
        json={"email": bob_email, "permission": "view"},
        headers=auth_headers(alice_email),
    )

    response = await client.get(
        f"/api/v1/documents/{doc_id}/export?format=markdown", headers=auth_headers(bob_email)
    )

    assert response.status_code == 200


async def test_a_stranger_gets_nothing(client: AsyncClient, alice_email, bob_email):
    doc_id = await make_doc(client, alice_email)

    response = await client.get(
        f"/api/v1/documents/{doc_id}/export?format=markdown", headers=auth_headers(bob_email)
    )

    assert response.status_code == 404


async def test_an_unknown_format_is_refused(client: AsyncClient, alice_email):
    """Rather than quietly handing back Markdown under another name."""
    doc_id = await make_doc(client, alice_email)

    response = await client.get(
        f"/api/v1/documents/{doc_id}/export?format=pdf", headers=auth_headers(alice_email)
    )

    assert response.status_code == 422


async def test_export_requires_authentication(client: AsyncClient, alice_email):
    doc_id = await make_doc(client, alice_email)

    assert (
        await client.get(f"/api/v1/documents/{doc_id}/export?format=markdown")
    ).status_code == 401


def test_safe_filename_turns_a_title_into_a_file():
    assert safe_filename("Quarterly plan") == "Quarterly-plan.md"
    assert safe_filename("  spaces   collapse  ") == "spaces-collapse.md"


def test_safe_filename_removes_what_a_filesystem_would_refuse():
    assert "/" not in safe_filename("a/b")
    assert "\\" not in safe_filename("a\\b")
    assert ":" not in safe_filename("C:onflict")
    assert "\n" not in safe_filename("two\nlines")


def test_safe_filename_never_produces_a_nameless_file():
    """A title of only punctuation would otherwise yield ".md", which browsers
    refuse to save."""
    assert safe_filename("***") == "document.md"
    assert safe_filename("") == "document.md"
    assert safe_filename("   ") == "document.md"


def test_safe_filename_is_bounded():
    assert len(safe_filename("x" * 500)) <= 100


def test_safe_filename_keeps_letters_from_any_script():
    """A title is not required to be in English."""
    assert safe_filename("ہفتہ وار") == "ہفتہ-وار.md"
    assert safe_filename("季度计划") == "季度计划.md"


def test_truncation_never_leaves_a_double_dot():
    """Cutting at the cap can expose a trailing separator, and "..md" is ugly
    where ".md" was meant."""
    assert ".." not in safe_filename("y" * 95 + ".tail")


def test_content_disposition_is_encodable_as_a_header():
    """The bug this guards: header values are latin-1, so a Unicode filename
    placed there raises and turns a perfectly good export into a 500."""
    for title in ["ہفتہ وار", "季度计划", "Планы", "Café notes", "Quarterly plan"]:
        header = content_disposition(safe_filename(title))
        header.encode("latin-1")  # raises if the fix regresses


def test_content_disposition_carries_the_name_in_both_forms():
    header = content_disposition(safe_filename("季度计划"))

    assert header.startswith("attachment;")
    # Nothing of the original survives ASCII, so the fallback is the generic
    # name rather than a bare ".md" the browser would refuse.
    assert 'filename="document.md"' in header
    # ...while the UTF-8 form, which every current browser prefers, keeps it.
    assert "filename*=UTF-8''" in header
    assert "%E5%AD%A3" in header


def test_ascii_fallback_keeps_accented_names_readable():
    header = content_disposition(safe_filename("Café notes"))

    assert 'filename="Cafe-notes.md"' in header
