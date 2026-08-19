"""Folders: one person's own documents, grouped.

Organisation rather than access. Filing a document changes nothing about who can
read it, which is why nothing here touches permissions beyond confirming the
caller owns what they are filing.
"""

from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.models import Document, Folder

MAX_NAME_LENGTH = 120


def clean_name(raw: str) -> str:
    name = " ".join((raw or "").split())

    if not name:
        raise ValidationError("A folder needs a name")
    if len(name) > MAX_NAME_LENGTH:
        raise ValidationError(f"A folder name is limited to {MAX_NAME_LENGTH} characters")

    return name


async def list_folders(db: AsyncSession, user_id: UUID) -> list[tuple[Folder, int]]:
    """This person's folders with a document count, alphabetically.

    Counted in the same query rather than one per folder, which is the
    difference between a sidebar and a sidebar that makes ten round trips. The
    trash is excluded from the count: a deleted document is not in the folder as
    far as anyone reading the number is concerned.
    """
    result = await db.execute(
        select(Folder, func.count(Document.id))
        .outerjoin(
            Document,
            (Document.folder_id == Folder.id) & (Document.is_deleted.is_(False)),
        )
        .where(Folder.owner_id == user_id)
        .group_by(Folder.id)
        .order_by(func.lower(Folder.name))
    )
    return [(folder, count) for folder, count in result.all()]


async def create_folder(db: AsyncSession, user_id: UUID, name: str) -> Folder:
    folder = Folder(owner_id=user_id, name=clean_name(name))
    db.add(folder)

    try:
        await db.commit()
    except IntegrityError as exc:
        # The unique constraint on (owner_id, name). Two folders called
        # "Clients" in one sidebar is a bug report waiting to happen.
        await db.rollback()
        raise ValidationError("You already have a folder with that name") from exc

    await db.refresh(folder)
    return folder


async def _owned(db: AsyncSession, folder_id: UUID, user_id: UUID) -> Folder:
    """Fetch a folder the caller owns, or 404.

    Never 403: the whole app refuses to confirm that something exists to someone
    who may not see it, and a folder name is as much of a disclosure as a
    document title.
    """
    result = await db.execute(
        select(Folder).where(Folder.id == folder_id, Folder.owner_id == user_id)
    )
    folder = result.scalar_one_or_none()

    if folder is None:
        raise NotFoundError("Folder not found")

    return folder


async def rename_folder(db: AsyncSession, folder_id: UUID, user_id: UUID, name: str) -> Folder:
    folder = await _owned(db, folder_id, user_id)
    folder.name = clean_name(name)

    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise ValidationError("You already have a folder with that name") from exc

    await db.refresh(folder)
    return folder


async def delete_folder(db: AsyncSession, folder_id: UUID, user_id: UUID) -> None:
    """Delete the folder and keep its documents.

    ON DELETE SET NULL does the work; this is here to say so. Cascading would
    make reorganising destructive, and there is already a trash for deleting.
    """
    await _owned(db, folder_id, user_id)

    await db.execute(delete(Folder).where(Folder.id == folder_id))
    await db.commit()


async def assert_can_file_into(db: AsyncSession, folder_id: UUID | None, user_id: UUID) -> None:
    """Refuse a folder that is not the caller's, before a document is moved.

    Silently ignoring it would leave the document unfiled with no explanation,
    and accepting it would put someone's document into a stranger's folder.
    """
    if folder_id is None:
        return

    await _owned(db, folder_id, user_id)
