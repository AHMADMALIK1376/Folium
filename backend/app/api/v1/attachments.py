from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, File, Response, UploadFile, status

from app.api.deps import CurrentUser, DbSession
from app.core.exceptions import ValidationError
from app.schemas.attachment import AttachmentOut, AttachmentUrlOut
from app.services import attachments as service
from app.services.attachments import MAX_BYTES

router = APIRouter(prefix="/documents/{document_id}/attachments", tags=["attachments"])


@router.get("", response_model=list[AttachmentOut])
async def list_attachments(
    document_id: UUID, db: DbSession, user: CurrentUser
) -> list[AttachmentOut]:
    """What is attached to this document. Follows *view*."""
    rows = await service.list_attachments(db, document_id, user.id)

    return [AttachmentOut.model_validate(row) for row in rows]


@router.post("", response_model=AttachmentOut, status_code=status.HTTP_201_CREATED)
async def upload_attachment(
    document_id: UUID,
    db: DbSession,
    user: CurrentUser,
    file: Annotated[UploadFile, File()],
) -> AttachmentOut:
    """Attach a file. Requires *edit*.

    The bytes are read here and proxied to Storage rather than the browser being
    handed a signed upload URL. Signed uploads would save a hop, but they need a
    mint/upload/confirm dance whose failure mode is a row describing a file that
    was never stored. At 10MB, proxying is the simpler and more honest trade —
    and it is what document import has done since 2C-iii.
    """
    data = await file.read()

    # Checked before anything else touches it. UploadFile spools to disk beyond
    # a threshold, so an oversized body is not held in memory, but it must still
    # be refused before it is sent onward.
    if len(data) > MAX_BYTES:
        raise ValidationError(f"Attachments are limited to {MAX_BYTES // 1024 // 1024}MB")

    attachment = await service.create_attachment(
        db, document_id, user.id, file.filename or "", data
    )

    return AttachmentOut.model_validate(attachment)


@router.get("/{attachment_id}/url", response_model=AttachmentUrlOut)
async def get_attachment_url(
    document_id: UUID, attachment_id: UUID, db: DbSession, user: CurrentUser
) -> AttachmentUrlOut:
    """A short-lived signed URL for the file. Follows *view*.

    A URL rather than the bytes: the browser fetches from Storage directly, so a
    free-tier Python host never streams file downloads.
    """
    url, expires_in = await service.attachment_url(db, document_id, attachment_id, user.id)

    return AttachmentUrlOut(url=url, expires_in=expires_in)


@router.delete("/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_attachment(
    document_id: UUID, attachment_id: UUID, db: DbSession, user: CurrentUser
) -> Response:
    """Remove a file. Requires *edit*."""
    await service.delete_attachment(db, document_id, attachment_id, user.id)

    return Response(status_code=status.HTTP_204_NO_CONTENT)
