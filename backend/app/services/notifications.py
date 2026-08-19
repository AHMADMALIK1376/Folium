"""Telling someone that something happened to them.

Two rules carry this module.

**Nobody is notified about their own action.** Commenting on your own document,
replying to your own thread and mentioning yourself all produce nothing. It is
the rule most likely to be got wrong and the most obviously wrong when it is,
so it is enforced here and again by a check constraint.

**A notification never outlives the access it was created under.** Someone is
shared a document, notified about a comment, and then unshared; the row still
holds a document title. So access is re-checked on every read rather than
cleaned up on revocation — a cleanup job fails silently the first time someone
adds another way to lose access.
"""

from uuid import UUID

from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core.exceptions import ValidationError
from app.models import Comment, Document, DocumentShare, Notification, User

# A notification and the names it needs to read as a sentence.
Described = tuple[Notification, str | None, str]


def _visible_documents(user_id: UUID):
    """Documents this person can still see: their own, or shared with them.

    A subquery rather than a join so the caller can use it as a filter without
    multiplying rows when a document has several shares.
    """
    return select(Document.id).where(
        Document.is_deleted.is_(False),
        or_(
            Document.owner_id == user_id,
            Document.id.in_(
                select(DocumentShare.document_id).where(DocumentShare.user_id == user_id)
            ),
        ),
    )


def _record(
    db: AsyncSession,
    *,
    user_id: UUID,
    actor_id: UUID,
    kind: str,
    document_id: UUID,
    comment_id: UUID | None = None,
) -> None:
    """Add one notification to the current transaction.

    Deliberately not async and deliberately not committing: a notification is
    written in the same transaction as the thing that caused it, so there is no
    moment where the comment exists and the notification does not.
    """
    if user_id == actor_id:
        return

    db.add(
        Notification(
            user_id=user_id,
            actor_id=actor_id,
            kind=kind,
            document_id=document_id,
            comment_id=comment_id,
        )
    )


async def for_new_comment(
    db: AsyncSession,
    *,
    comment: Comment,
    document: Document,
    actor_id: UUID,
    mentioned: list[UUID],
) -> None:
    """Everyone who should hear about a new comment, each told once.

    One event, one notification: a reply that also mentions the thread's author
    is a mention and not both, because "Ada mentioned you" says everything "Ada
    replied" says and more. `told` is what enforces that, and the order of these
    three blocks is what decides which kind wins.
    """
    told: set[UUID] = {actor_id}

    for user_id in mentioned:
        if user_id in told:
            continue
        told.add(user_id)
        _record(
            db,
            user_id=user_id,
            actor_id=actor_id,
            kind="mention",
            document_id=document.id,
            comment_id=comment.id,
        )

    if comment.parent_id is not None:
        parent = (
            await db.execute(select(Comment).where(Comment.id == comment.parent_id))
        ).scalar_one_or_none()

        if parent is not None and parent.author_id is not None and parent.author_id not in told:
            told.add(parent.author_id)
            _record(
                db,
                user_id=parent.author_id,
                actor_id=actor_id,
                kind="reply",
                document_id=document.id,
                comment_id=comment.id,
            )

    if document.owner_id not in told:
        _record(
            db,
            user_id=document.owner_id,
            actor_id=actor_id,
            # A reply on your own document is still news about your document.
            kind="reply" if comment.parent_id is not None else "comment",
            document_id=document.id,
            comment_id=comment.id,
        )


def for_new_share(db: AsyncSession, *, user_id: UUID, actor_id: UUID, document_id: UUID) -> None:
    _record(db, user_id=user_id, actor_id=actor_id, kind="share", document_id=document_id)


async def resolve_mentions(
    db: AsyncSession, document_id: UUID, user_ids: list[UUID]
) -> list[UUID]:
    """Check that every mentioned person can see the document.

    Refused rather than silently dropped: a dropped mention is a message the
    sender believes they sent. Mentioning someone without access would either
    leak the document's existence to them or promise them a link they cannot
    open.
    """
    if not user_ids:
        return []

    unique = list(dict.fromkeys(user_ids))

    allowed = set(
        (
            await db.execute(
                select(User.id).where(
                    User.id.in_(unique),
                    or_(
                        User.id.in_(select(Document.owner_id).where(Document.id == document_id)),
                        User.id.in_(
                            select(DocumentShare.user_id).where(
                                DocumentShare.document_id == document_id
                            )
                        ),
                    ),
                )
            )
        ).scalars()
    )

    if len(allowed) != len(unique):
        raise ValidationError("You can only mention people the document is shared with")

    return unique


async def list_for(db: AsyncSession, user_id: UUID, limit: int = 50) -> list[Described]:
    """This person's notifications, newest first, with the names to read them.

    Filtered by what they can see *now*, not by what they could see when the row
    was written. See the module docstring.
    """
    # Aliased because users appears twice in spirit — once as the recipient
    # (never joined, only filtered) and once as the actor.
    actor = aliased(User)

    result = await db.execute(
        select(Notification, actor.display_name, Document.title)
        .join(Document, Notification.document_id == Document.id)
        .outerjoin(actor, Notification.actor_id == actor.id)
        .where(
            Notification.user_id == user_id,
            Notification.document_id.in_(_visible_documents(user_id)),
        )
        .order_by(Notification.created_at.desc())
        .limit(limit)
    )

    return [(notification, name, title) for notification, name, title in result.all()]


async def unread_count(db: AsyncSession, user_id: UUID) -> int:
    result = await db.execute(
        select(func.count(Notification.id)).where(
            Notification.user_id == user_id,
            Notification.read_at.is_(None),
            Notification.document_id.in_(_visible_documents(user_id)),
        )
    )
    return result.scalar_one()


async def mark_read(db: AsyncSession, user_id: UUID, ids: list[UUID] | None) -> int:
    """Mark some notifications read, or all of them when `ids` is None.

    Someone else's id in the list is ignored rather than refused: a partial
    batch is not an error, and saying which ids were not theirs would confirm
    those ids exist.
    """
    statement = (
        update(Notification)
        .where(Notification.user_id == user_id, Notification.read_at.is_(None))
        .values(read_at=func.now())
    )

    if ids is not None:
        if not ids:
            return 0
        statement = statement.where(Notification.id.in_(ids))

    result = await db.execute(statement)
    await db.commit()

    return result.rowcount or 0


async def forget_share(db: AsyncSession, document_id: UUID, user_id: UUID) -> None:
    """Drop the share notification when a share is revoked.

    Belt as well as braces: `list_for` already hides notifications for documents
    the caller can no longer see, so this changes nothing they could observe. It
    is here because "you were given access" is the one kind whose text is false
    once access is gone, and leaving a false row for the filter to hide is a bet
    on the filter never being bypassed.
    """
    await db.execute(
        delete(Notification).where(
            Notification.document_id == document_id,
            Notification.user_id == user_id,
            Notification.kind == "share",
        )
    )
