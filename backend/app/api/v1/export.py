import re
import unicodedata
from typing import Literal
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Response

from app.api.deps import CurrentUser, DbSession
from app.services import documents as service
from app.utils.import_file import doc_to_markdown

router = APIRouter(prefix="/documents/{document_id}/export", tags=["documents"])

# Anything a filesystem or a Content-Disposition header would object to.
_UNSAFE = re.compile(r"[^\w\-. ]+", re.UNICODE)
_MAX_STEM = 96


def safe_filename(title: str) -> str:
    """Turn a document title into a filename a browser will accept.

    Kept separate from the route so it can be tested directly, because the
    interesting cases are the ugly ones: a title made only of punctuation would
    otherwise produce ".md", which browsers refuse to save, and a very long one
    would exceed what some filesystems allow.

    `\\w` is Unicode-aware, so a title in any script keeps its own letters. That
    is the name people should get, and `content_disposition` is what carries it
    safely.
    """
    cleaned = _UNSAFE.sub("", title or "")
    cleaned = "-".join(cleaned.split())
    # Stripped again after truncation: cutting at the cap can expose a trailing
    # separator, and a trailing "." would produce "..md".
    cleaned = cleaned.strip("-.")[:_MAX_STEM].strip("-.")

    return f"{cleaned or 'document'}.md"


def _ascii_fallback(filename: str) -> str:
    """An ASCII-only form of `filename`, for the plain `filename=` parameter.

    HTTP header values are encoded latin-1, but a title may be written in any
    script — so the Unicode name cannot go there unescaped. It raises on encode,
    and the export of a document whose only fault is not being in English
    becomes a 500.

    Accents decompose to their base letters, so "Café" stays recognisable.
    Anything with no ASCII form at all — Urdu, Chinese, Cyrillic — drops out
    entirely, and a name left empty falls back rather than becoming ".md".
    """
    stripped = (
        unicodedata.normalize("NFKD", filename).encode("ascii", "ignore").decode("ascii")
    )
    stem = stripped.removesuffix(".md")

    return f"{stem.strip('-. ') or 'document'}.md"


def content_disposition(filename: str) -> str:
    """Build the header, carrying the name twice as RFC 6266 requires.

    `filename*` is the UTF-8 form every current browser prefers, percent-encoded
    so the header stays ASCII; `filename=` is the plain fallback for anything
    that does not understand it. Sending only the first would lose the name on
    old clients, and only the second would lose the script.
    """
    quoted = quote(filename, safe="")

    return f"attachment; filename=\"{_ascii_fallback(filename)}\"; filename*=UTF-8''{quoted}"


@router.get("")
async def export_document(
    document_id: UUID,
    db: DbSession,
    user: CurrentUser,
    # A Literal, so FastAPI rejects anything else with a 422 before the handler
    # runs. PDF is deliberately absent: the browser makes those from a print
    # stylesheet, and offering it here would imply a renderer that does not
    # exist.
    format: Literal["markdown"] = "markdown",
) -> Response:
    """Download a document as Markdown.

    Follows *view* permission — get_document raises the usual 404 for anyone
    else. Someone who can open the document can already read every word of it,
    so letting them keep a copy discloses nothing more.
    """
    document, _ = await service.get_document(db, document_id, user.id)

    body = doc_to_markdown(document.content)

    return Response(
        content=body,
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": content_disposition(safe_filename(document.title))},
    )
