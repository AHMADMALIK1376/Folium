from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.constants import empty_doc
from app.core.exceptions import NotFoundError
from app.models import Document, DocumentShare, User
from app.schemas.document import DocumentCreate, DocumentUpdate
from app.services import folders, versions
from app.services.permissions import Permission, can_edit, can_view, resolve_permission
from app.utils.import_file import doc_to_plain_text


async def _shares_for(db: AsyncSession, document_id: UUID) -> dict[UUID, str]:
    result = await db.execute(
        select(DocumentShare.user_id, DocumentShare.permission).where(
            DocumentShare.document_id == document_id
        )
    )
    return {row.user_id: row.permission for row in result}


async def get_document(
    db: AsyncSession, document_id: UUID, user_id: UUID
) -> tuple[Document, Permission]:
    """Fetch a document the user may see.

    Raises NotFoundError for both "does not exist" and "not allowed", so the
    API cannot leak the existence of documents the caller may not see.
    """
    result = await db.execute(select(Document).where(Document.id == document_id))
    document = result.scalar_one_or_none()

    if document is None or document.is_deleted:
        raise NotFoundError("Document not found")

    shares = await _shares_for(db, document_id)
    permission = resolve_permission(document.owner_id, user_id, shares)

    if not can_view(permission):
        raise NotFoundError("Document not found")

    return document, permission


async def list_documents(
    db: AsyncSession, user_id: UUID
) -> tuple[list[Document], list[Document]]:
    owned_result = await db.execute(
        select(Document)
        .where(Document.owner_id == user_id, Document.is_deleted.is_(False))
        .order_by(Document.updated_at.desc())
    )
    shared_result = await db.execute(
        select(Document)
        .join(DocumentShare, DocumentShare.document_id == Document.id)
        .where(DocumentShare.user_id == user_id, Document.is_deleted.is_(False))
        .order_by(Document.updated_at.desc())
    )
    return list(owned_result.scalars()), list(shared_result.scalars())


async def list_trash(db: AsyncSession, user_id: UUID) -> list[Document]:
    """Soft-deleted documents the user owns, most recently deleted first.

    Owner-only by construction: a collaborator cannot restore a document, and
    showing it in their trash would imply a claim they do not have.
    """
    result = await db.execute(
        select(Document)
        .where(Document.owner_id == user_id, Document.is_deleted.is_(True))
        .order_by(Document.deleted_at.desc())
    )
    return list(result.scalars())


async def create_document(db: AsyncSession, user_id: UUID, data: DocumentCreate) -> Document:
    content = data.content if data.content is not None else empty_doc()
    document = Document(
        owner_id=user_id,
        title=data.title,
        content=content,
        content_text=doc_to_plain_text(content),
    )
    db.add(document)
    await db.commit()
    await db.refresh(document)
    return document


async def update_document(
    db: AsyncSession, document_id: UUID, user_id: UUID, data: DocumentUpdate
) -> tuple[Document, Permission]:
    document, permission = await get_document(db, document_id, user_id)
    if not can_edit(permission):
        raise NotFoundError("Document not found")

    if data.title is not None:
        document.title = data.title
    if data.content is not None:
        # Before the assignment, so the row holds the content being replaced —
        # that is what makes restoring mean "go back" rather than "duplicate
        # what is already on screen". In the same transaction as the update, so
        # a failed write cannot leave a snapshot of a state that never existed.
        #
        # Title-only updates deliberately snapshot nothing: a title is one
        # string, retyped in seconds, and copying the whole body because someone
        # fixed a typo would spend the budget the interval exists to protect.
        await versions.maybe_snapshot(db, document, user_id)
        document.content = data.content
        document.content_text = doc_to_plain_text(data.content)

    # `in model_fields_set` rather than `is not None`, because None is a
    # meaningful value here — it unfiles the document. Checking for None would
    # make every title-only autosave silently take the document out of its
    # folder.
    if "folder_id" in data.model_fields_set:
        # Only the owner may file, and only into their own folder. Filing is
        # organisation rather than access, but a collaborator filing someone
        # else's document into a folder they cannot see would be neither.
        if document.owner_id != user_id:
            raise NotFoundError("Document not found")
        await folders.assert_can_file_into(db, data.folder_id, user_id)
        document.folder_id = data.folder_id

    await db.commit()
    await db.refresh(document)
    return document, permission


async def soft_delete_document(db: AsyncSession, document_id: UUID, user_id: UUID) -> None:
    result = await db.execute(select(Document).where(Document.id == document_id))
    document = result.scalar_one_or_none()

    if document is None or document.is_deleted or document.owner_id != user_id:
        raise NotFoundError("Document not found")

    document.is_deleted = True
    document.deleted_at = datetime.now(UTC)
    await db.commit()


async def restore_document(db: AsyncSession, document_id: UUID, user_id: UUID) -> Document:
    result = await db.execute(select(Document).where(Document.id == document_id))
    document = result.scalar_one_or_none()

    if document is None or not document.is_deleted or document.owner_id != user_id:
        raise NotFoundError("Document not found")

    document.is_deleted = False
    document.deleted_at = None
    await db.commit()
    await db.refresh(document)
    return document


async def load_owner(db: AsyncSession, owner_id: UUID) -> User:
    result = await db.execute(select(User).where(User.id == owner_id))
    return result.scalar_one()
