"""Starring a document.

Access is inherited rather than restated: every function resolves the document
through `documents.get_document`, which already raises NotFoundError for a
document that does not exist and for one the caller may not see. Starring
follows *view* — it is a private bookmark, not a change to the document, so
anyone who can read it may keep one.
"""

from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Document, DocumentStar


async def star(db: AsyncSession, document_id: UUID, user_id: UUID) -> None:
    """Star a document. Starring one that is already starred is not an error.

    An upsert rather than check-then-insert: the composite primary key makes
    this idempotent, so two clicks in quick succession cannot race into a
    duplicate-key error.
    """
    from app.services.documents import get_document

    await get_document(db, document_id, user_id)

    await db.execute(
        pg_insert(DocumentStar)
        .values(user_id=user_id, document_id=document_id)
        .on_conflict_do_nothing(index_elements=[DocumentStar.user_id, DocumentStar.document_id])
    )
    await db.commit()


async def unstar(db: AsyncSession, document_id: UUID, user_id: UUID) -> None:
    """Remove a star. Idempotent for the same reason DELETE usually is."""
    from app.services.documents import get_document

    await get_document(db, document_id, user_id)

    await db.execute(
        delete(DocumentStar).where(
            DocumentStar.user_id == user_id, DocumentStar.document_id == document_id
        )
    )
    await db.commit()


async def list_starred(db: AsyncSession, user_id: UUID) -> list[Document]:
    """Starred documents, most recently starred first.

    The trash is excluded: a deleted document is not a shortcut. Its star is
    kept rather than removed, so restoring the document restores the star with
    it — deleting is meant to be undoable, and quietly discarding the bookmark
    would make it a little less so.
    """
    result = await db.execute(
        select(Document)
        .join(DocumentStar, DocumentStar.document_id == Document.id)
        .where(DocumentStar.user_id == user_id, Document.is_deleted.is_(False))
        .order_by(DocumentStar.created_at.desc())
    )
    return list(result.scalars())


async def starred_ids(db: AsyncSession, user_id: UUID, document_ids: list[UUID]) -> set[UUID]:
    """Which of these documents this person has starred.

    One query for a whole page rather than one per row, which is the difference
    between a dashboard and a dashboard that makes fifty round trips.
    """
    if not document_ids:
        return set()

    result = await db.execute(
        select(DocumentStar.document_id).where(
            DocumentStar.user_id == user_id, DocumentStar.document_id.in_(document_ids)
        )
    )
    return set(result.scalars())
