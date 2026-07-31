from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.models import Document, DocumentVersion, User
from app.services.permissions import can_edit
from app.utils.import_file import doc_to_plain_text

# How long to wait before one document earns another snapshot.
#
# Autosave fires roughly every 800ms while someone types, so snapshotting every
# update would put hundreds of full-document JSONB copies per session into a
# database whose free tier holds 500MB of real users' documents. Five minutes
# turns an afternoon's editing into a handful of rows while keeping the loss
# from any single mistake small.
SNAPSHOT_INTERVAL = timedelta(minutes=5)

# Retention, per document. Bounds the table by document count rather than by
# editing time: a document edited daily for a year holds the same 50 rows as one
# edited for a week. Age-based retention would not — a heavily edited document
# can write thousands of rows inside thirty days.
MAX_VERSIONS_PER_DOCUMENT = 50


async def _newest(db: AsyncSession, document_id: UUID) -> DocumentVersion | None:
    result = await db.execute(
        select(DocumentVersion)
        .where(DocumentVersion.document_id == document_id)
        .order_by(DocumentVersion.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def snapshot(db: AsyncSession, document: Document, user_id: UUID) -> DocumentVersion:
    """Record the document's current content as a version, unconditionally.

    Records `document.content` as it stands, so callers must call this *before*
    assigning new content — the row is the state being replaced, which is what
    makes restoring mean "go back".

    Does not commit: the caller owns the transaction, so the snapshot and the
    update it protects land together or not at all.
    """
    version = DocumentVersion(
        document_id=document.id,
        content=document.content,
        created_by=user_id,
    )
    db.add(version)
    return version


async def maybe_snapshot(
    db: AsyncSession, document: Document, user_id: UUID
) -> DocumentVersion | None:
    """Snapshot only when this edit is worth a row.

    Three cases earn one: the document has no history yet, the newest version is
    older than SNAPSHOT_INTERVAL, or someone else wrote it.

    That last rule carries more weight than its size suggests. Two collaborators
    overwriting each other is exactly what version history exists to rescue, and
    time-bucketing alone would let one person's edit silently replace another's
    inside the same five-minute window with nothing kept.
    """
    newest = await _newest(db, document.id)

    if (
        newest is not None
        and newest.created_by == user_id
        and _age(newest) < SNAPSHOT_INTERVAL
    ):
        return None

    version = await snapshot(db, document, user_id)
    await prune(db, document.id)
    return version


def _age(version: DocumentVersion) -> timedelta:
    created = version.created_at
    # Postgres returns timestamptz as aware, but a row created in this session
    # and not yet refreshed can still carry a naive value.
    if created.tzinfo is None:
        created = created.replace(tzinfo=UTC)
    return datetime.now(UTC) - created


async def prune(db: AsyncSession, document_id: UUID) -> None:
    """Drop everything outside the newest MAX_VERSIONS_PER_DOCUMENT.

    Scoped to one document, so the cost is proportional to that document rather
    than to the table. Does not commit — it runs in the caller's transaction, so
    the retention invariant cannot drift from the insert that triggered it.
    """
    keep = (
        select(DocumentVersion.id)
        .where(DocumentVersion.document_id == document_id)
        .order_by(DocumentVersion.created_at.desc())
        .limit(MAX_VERSIONS_PER_DOCUMENT)
        .scalar_subquery()
    )

    await db.execute(
        delete(DocumentVersion).where(
            DocumentVersion.document_id == document_id,
            DocumentVersion.id.not_in(keep),
        )
    )


async def list_versions(
    db: AsyncSession, document_id: UUID, user_id: UUID
) -> list[tuple[DocumentVersion, str | None]]:
    """A document's history, newest first, with each author's display name.

    Access follows *view* permission, enforced by get_document — someone who can
    open the document can already read its current content, and its history is
    the same document over time. get_document also raises NotFoundError for a
    document the caller may not see, so this cannot be used to discover one.
    """
    from app.services.documents import get_document

    await get_document(db, document_id, user_id)

    result = await db.execute(
        select(DocumentVersion, User.display_name)
        .outerjoin(User, User.id == DocumentVersion.created_by)
        .where(DocumentVersion.document_id == document_id)
        .order_by(DocumentVersion.created_at.desc())
    )
    return [(row[0], row[1]) for row in result]


async def get_version(
    db: AsyncSession, document_id: UUID, version_id: UUID, user_id: UUID
) -> tuple[DocumentVersion, str | None]:
    """One version, with its content.

    Filters on the document id as well as the version id, and that is
    load-bearing rather than tidy: matching on the version alone would make
    `/documents/A/versions/{id-from-B}` a way to read B's content through A's
    permissions.
    """
    from app.services.documents import get_document

    await get_document(db, document_id, user_id)

    result = await db.execute(
        select(DocumentVersion, User.display_name)
        .outerjoin(User, User.id == DocumentVersion.created_by)
        .where(
            DocumentVersion.id == version_id,
            DocumentVersion.document_id == document_id,
        )
    )
    row = result.first()
    if row is None:
        raise NotFoundError("Version not found")
    return row[0], row[1]


async def restore_version(
    db: AsyncSession, document_id: UUID, version_id: UUID, user_id: UUID
) -> Document:
    """Put a document back to an earlier state.

    Requires edit permission, not ownership: an editor can already replace the
    whole body by selecting all and typing, so restricting this would protect
    nothing while removing the one safe way to undo that.

    The current content is snapshotted first, unconditionally and ignoring the
    interval — restoring the wrong draft has to be undoable, and a restore is
    deliberate enough to be worth a row.
    """
    from app.services.documents import get_document

    document, permission = await get_document(db, document_id, user_id)
    if not can_edit(permission):
        raise NotFoundError("Document not found")

    result = await db.execute(
        select(DocumentVersion).where(
            DocumentVersion.id == version_id,
            DocumentVersion.document_id == document_id,
        )
    )
    version = result.scalar_one_or_none()
    if version is None:
        raise NotFoundError("Version not found")

    await snapshot(db, document, user_id)

    document.content = version.content
    document.content_text = doc_to_plain_text(version.content)

    await prune(db, document_id)
    await db.commit()
    await db.refresh(document)
    return document
