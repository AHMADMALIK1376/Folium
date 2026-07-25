from datetime import datetime
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.models import Document, DocumentShare, User
from app.schemas.share import ShareCreate
from app.services.permissions import Permission
from app.services.documents import get_document


async def _require_owner(db: AsyncSession, document_id: UUID, user_id: UUID) -> Document:
    document, permission = await get_document(db, document_id, user_id)
    if permission is not Permission.OWNER:
        raise NotFoundError("Document not found")
    return document


async def list_shares(
    db: AsyncSession, document_id: UUID, user_id: UUID
) -> list[tuple[User, str, datetime]]:
    await get_document(db, document_id, user_id)
    result = await db.execute(
        select(User, DocumentShare.permission, DocumentShare.created_at)
        .join(DocumentShare, DocumentShare.user_id == User.id)
        .where(DocumentShare.document_id == document_id)
        .order_by(User.display_name)
    )
    return [(row[0], row[1], row[2]) for row in result]


async def share_document(
    db: AsyncSession, document_id: UUID, owner_id: UUID, data: ShareCreate
) -> tuple[User, DocumentShare]:
    await _require_owner(db, document_id, owner_id)

    email = data.email.strip().lower()
    result = await db.execute(select(User).where(User.email == email))
    target = result.scalar_one_or_none()

    if target is None:
        raise ValidationError("No user with that email")
    if target.id == owner_id:
        raise ValidationError("You already own this document")

    existing = await db.execute(
        select(DocumentShare).where(
            DocumentShare.document_id == document_id,
            DocumentShare.user_id == target.id,
        )
    )
    share = existing.scalar_one_or_none()

    if share is None:
        share = DocumentShare(
            document_id=document_id,
            user_id=target.id,
            permission=data.permission,
            granted_by=owner_id,
        )
        db.add(share)
    else:
        share.permission = data.permission

    await db.commit()
    await db.refresh(share)
    return target, share


async def update_share(
    db: AsyncSession, document_id: UUID, owner_id: UUID, target_user_id: UUID, permission: str
) -> None:
    await _require_owner(db, document_id, owner_id)
    result = await db.execute(
        select(DocumentShare).where(
            DocumentShare.document_id == document_id,
            DocumentShare.user_id == target_user_id,
        )
    )
    share = result.scalar_one_or_none()
    if share is None:
        raise NotFoundError("Share not found")

    share.permission = permission
    await db.commit()


async def unshare_document(
    db: AsyncSession, document_id: UUID, owner_id: UUID, target_user_id: UUID
) -> None:
    await _require_owner(db, document_id, owner_id)
    await db.execute(
        delete(DocumentShare).where(
            DocumentShare.document_id == document_id,
            DocumentShare.user_id == target_user_id,
        )
    )
    await db.commit()
