import uuid

import pytest
from httpx import AsyncClient


@pytest.fixture
def alice() -> dict[str, str]:
    return {"X-Dev-User-Email": f"alice-{uuid.uuid4()}@example.com"}


async def test_import_markdown_creates_formatted_document(client: AsyncClient, alice):
    files = {"file": ("notes.md", b"# Title\n\nSome **bold** text", "text/markdown")}
    response = await client.post("/api/v1/documents/import", files=files, headers=alice)

    assert response.status_code == 201
    body = response.json()
    assert body["title"] == "notes"
    assert body["content"]["content"][0]["type"] == "heading"


async def test_import_plain_text(client: AsyncClient, alice):
    files = {"file": ("my_notes.txt", b"first para\n\nsecond para", "text/plain")}
    response = await client.post("/api/v1/documents/import", files=files, headers=alice)

    assert response.status_code == 201
    assert response.json()["title"] == "my notes"
    assert len(response.json()["content"]["content"]) == 2


async def test_rejects_unsupported_extension(client: AsyncClient, alice):
    files = {"file": ("photo.png", b"\x89PNG\r\n", "image/png")}
    response = await client.post("/api/v1/documents/import", files=files, headers=alice)

    assert response.status_code == 422
    assert "supported" in response.json()["detail"].lower()


async def test_rejects_oversized_file(client: AsyncClient, alice):
    files = {"file": ("big.txt", b"x" * (2 * 1024 * 1024 + 1), "text/plain")}
    response = await client.post("/api/v1/documents/import", files=files, headers=alice)

    assert response.status_code == 422
    assert "2mb" in response.json()["detail"].lower()


async def test_rejects_non_utf8_content(client: AsyncClient, alice):
    files = {"file": ("bad.txt", b"\xff\xfe\x00binary", "text/plain")}
    response = await client.post("/api/v1/documents/import", files=files, headers=alice)

    assert response.status_code == 422


async def test_long_filename_is_truncated_not_500(client: AsyncClient, alice):
    # Test that a 600-character filename is truncated to 500, not causing a 500 error
    long_name = "x" * 600 + ".txt"
    files = {"file": (long_name, b"test content", "text/plain")}
    response = await client.post("/api/v1/documents/import", files=files, headers=alice)

    assert response.status_code == 201
    assert len(response.json()["title"]) == 500
