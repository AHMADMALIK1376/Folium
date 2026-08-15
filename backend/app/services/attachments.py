"""Attaching files to a document.

Permission is never decided here from first principles. Every function resolves
the document through `documents.get_document`, which already raises
`NotFoundError` both for a document that does not exist and for one the caller
may not see — so attachments inherit the access rules rather than restating
them. Reading follows *view*; changing follows *edit*, the same split version
history uses.
"""

import logging
import uuid
from pathlib import Path
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.models import Attachment
from app.services import storage
from app.services.permissions import can_edit

logger = logging.getLogger(__name__)

# Ten times the 2MB import limit, which is text. Large enough for a photo or a
# slide, small enough that proxying the bytes through FastAPI is reasonable.
MAX_BYTES = 10 * 1024 * 1024

# A bound that exists so that one does, rather than discovering its absence when
# a document holds four thousand files.
MAX_PER_DOCUMENT = 20

# What a document editor is actually for. The type is decided by this table and
# never by the request: a client-supplied Content-Type is a claim by the
# uploader, and storing it unchecked serves the bytes back under a type they are
# not.
#
# SVG is absent deliberately, not by oversight. It is an image, but it is also a
# document format that can carry script, and these files are served from a URL
# the user is invited to open. Nothing else in this list can execute.
CONTENT_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".markdown": "text/markdown",
    ".csv": "text/csv",
}

MAX_FILENAME_LENGTH = 500  # Matches Attachment.filename


def content_type_for(filename: str) -> str:
    """The stored content type for a filename, by extension.

    Raises `ValidationError` for anything not on the allow-list, which is the
    whole mechanism: an unknown extension is refused rather than stored as
    application/octet-stream and worried about later.
    """
    suffix = Path(filename or "").suffix.lower()
    content_type = CONTENT_TYPES.get(suffix)

    if content_type is None:
        raise ValidationError(f"{suffix or 'That file type'} is not an allowed attachment")

    return content_type


def storage_path(document_id: UUID, attachment_id: UUID, filename: str) -> str:
    """Where the bytes live: `{document}/{attachment}{ext}`.

    Contains nothing the user typed. Building a path from a supplied filename is
    how directory traversal happens, and there is no reason to accept the risk
    when two ids already identify the object uniquely. The original name is kept
    in the database, for display and for the download.
    """
    return f"{document_id}/{attachment_id}{Path(filename or '').suffix.lower()}"


async def list_attachments(
    db: AsyncSession, document_id: UUID, user_id: UUID
) -> list[Attachment]:
    """Everything attached to a document, oldest first.

    Follows *view*: anyone who can read the document can see what is attached to
    it, exactly as they can read its history.
    """
    from app.services.documents import get_document

    await get_document(db, document_id, user_id)

    result = await db.execute(
        select(Attachment)
        .where(Attachment.document_id == document_id)
        .order_by(Attachment.created_at.asc())
    )
    return list(result.scalars().all())


async def create_attachment(
    db: AsyncSession, document_id: UUID, user_id: UUID, filename: str, data: bytes
) -> Attachment:
    """Store a file and record it. Requires *edit*.

    The bytes go to Storage before the row is written, so a failed upload leaves
    no database row describing a file that does not exist. The reverse order
    would be faster to write and permanently wrong.
    """
    from app.services.documents import get_document

    _, permission = await get_document(db, document_id, user_id)
    if not can_edit(permission):
        # Not PermissionDeniedError: a 403 would confirm the document exists to
        # someone who may only view it. Attachments hang off documents and
        # inherit that rule.
        raise NotFoundError("Document not found")

    if not data:
        raise ValidationError("That file is empty")

    if len(data) > MAX_BYTES:
        raise ValidationError(f"Attachments are limited to {MAX_BYTES // 1024 // 1024}MB")

    content_type = content_type_for(filename)

    count = await db.scalar(
        select(func.count())
        .select_from(Attachment)
        .where(Attachment.document_id == document_id)
    )
    if (count or 0) >= MAX_PER_DOCUMENT:
        raise ValidationError(f"A document can hold {MAX_PER_DOCUMENT} attachments")

    attachment_id = uuid.uuid4()
    path = storage_path(document_id, attachment_id, filename)

    await storage.upload(path, data, content_type)

    attachment = Attachment(
        id=attachment_id,
        document_id=document_id,
        filename=(filename or "file")[:MAX_FILENAME_LENGTH],
        mime_type=content_type,
        size_bytes=len(data),
        storage_path=path,
    )
    db.add(attachment)
    await db.commit()
    await db.refresh(attachment)

    return attachment


async def _load(db: AsyncSession, document_id: UUID, attachment_id: UUID) -> Attachment:
    """Fetch an attachment, scoped to its document.

    Scoped deliberately: without the document_id in the predicate, an id from
    another document would load and be acted on by someone with permission on
    *this* one.
    """
    result = await db.execute(
        select(Attachment).where(
            Attachment.id == attachment_id, Attachment.document_id == document_id
        )
    )
    attachment = result.scalar_one_or_none()

    if attachment is None:
        raise NotFoundError("Attachment not found")

    return attachment


async def attachment_url(
    db: AsyncSession, document_id: UUID, attachment_id: UUID, user_id: UUID
) -> tuple[str, int]:
    """A short-lived signed URL for the file. Follows *view*."""
    from app.services.documents import get_document

    await get_document(db, document_id, user_id)
    attachment = await _load(db, document_id, attachment_id)

    url = await storage.signed_url(attachment.storage_path)

    return url, storage.DOWNLOAD_URL_TTL_SECONDS


async def delete_attachment(
    db: AsyncSession, document_id: UUID, attachment_id: UUID, user_id: UUID
) -> None:
    """Remove a file and its row. Requires *edit*."""
    from app.services.documents import get_document

    _, permission = await get_document(db, document_id, user_id)
    if not can_edit(permission):
        raise NotFoundError("Document not found")

    attachment = await _load(db, document_id, attachment_id)

    await storage.remove([attachment.storage_path])

    await db.delete(attachment)
    await db.commit()


# Deliberately no `remove_objects_for_document`. Deleting a document is a *soft*
# delete into the trash and is meant to be reversible, so its files must survive
# it — a restore that returned a document without its attachments would be a
# worse bug than bytes sitting in a bucket. Nothing in the product destroys a
# document for good, so there is no moment at which those objects should go.
#
# The one place rows really do disappear is `scripts/clean_test_data.py`, which
# hard-deletes test accounts; it removes their objects itself. When a permanent
# delete is added, it owes Storage the same courtesy.
