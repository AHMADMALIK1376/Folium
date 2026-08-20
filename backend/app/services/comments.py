"""Comments: the first thing in this app a non-editor can create.

Nothing here writes document content, and that is the design rather than a
happy accident. A comment's anchor is a text quote selector stored on the
comment row; a mark in the document would have made commenting a content write,
which is exactly the capability the `comment` permission withholds.
"""

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core.exceptions import NotFoundError, PermissionDeniedError, ValidationError
from app.models import Comment, CommentMention, User
from app.schemas.comment import CommentCreate, CommentUpdate
from app.services import notifications
from app.services.documents import get_document
from app.services.permissions import Permission, can_comment

# A comment and its author's display name, which is None when the account was
# deleted — author_id is ON DELETE SET NULL, so a discussion outlives the
# account that took part in it.
Authored = tuple[Comment, str | None]


async def _document_access(db: AsyncSession, document_id: UUID, user_id: UUID) -> Permission:
    """The caller's permission on the document, or 404.

    `get_document` already refuses a document the caller cannot see, and refuses
    it as a 404 rather than a 403 — so a comment on a document you may not read
    is indistinguishable from a comment that does not exist.
    """
    _, permission = await get_document(db, document_id, user_id)
    return permission


def _with_author(*extra):
    """A select of comments joined to their author's name.

    One query for the names as well as the rows: fetching a display name per
    comment is how a ten-comment document becomes eleven round trips.
    """
    author = aliased(User)
    return select(Comment, author.display_name, *extra).outerjoin(
        author, Comment.author_id == author.id
    )


async def list_threads(db: AsyncSession, document_id: UUID, user_id: UUID) -> list[Authored]:
    """Every comment on a document, oldest first, with its author's name.

    Roots and replies come back together rather than a query per thread; the
    caller assembles them. Anyone who can view the document can read its
    comments — a discussion about a document is part of reading it.
    """
    await _document_access(db, document_id, user_id)

    result = await db.execute(
        _with_author().where(Comment.document_id == document_id).order_by(Comment.created_at)
    )
    return [(comment, name) for comment, name in result.all()]


async def _comment_for(
    db: AsyncSession, document_id: UUID, comment_id: UUID, user_id: UUID
) -> tuple[Comment, str | None, Permission]:
    """Fetch a comment the caller can at least see, with their document permission.

    The document is checked first, so a comment on a document the caller may not
    read is a 404 — a comment's existence is as sensitive as its document's.
    Whether they may *change* it is a separate question, answered by each caller
    below, and answered with 403: by then they already know the comment exists,
    so saying "not yours to edit" reveals nothing.

    The comment must belong to the document in the path. Otherwise
    `/documents/{mine}/comments/{yours}` would let anyone with a document of
    their own reach any comment in the system.
    """
    permission = await _document_access(db, document_id, user_id)

    result = await db.execute(
        _with_author().where(Comment.id == comment_id, Comment.document_id == document_id)
    )
    row = result.one_or_none()

    if row is None:
        raise NotFoundError("Comment not found")

    comment, author_name = row
    return comment, author_name, permission


async def create_comment(
    db: AsyncSession, document_id: UUID, user: User, data: CommentCreate
) -> Authored:
    document, permission = await get_document(db, document_id, user.id)

    if not can_comment(permission):
        raise PermissionDeniedError("You do not have permission to comment on this document")

    if data.parent_id is not None:
        await _check_reply(db, document_id, data)

    # Checked before the comment is written, so a mention of someone without
    # access fails the whole request rather than posting a comment whose
    # addressee will never hear about it.
    mentioned = await notifications.resolve_mentions(db, document_id, data.mention_user_ids)

    comment = Comment(
        document_id=document_id,
        author_id=user.id,
        parent_id=data.parent_id,
        body=data.body,
        quote=data.quote,
        # Context without a quote anchors nothing, so it is not kept.
        prefix=data.prefix if data.quote else None,
        suffix=data.suffix if data.quote else None,
    )
    db.add(comment)
    # The comment needs an id before anything can point at it, and this keeps
    # the mentions and notifications in the same transaction: there is no moment
    # where the comment exists and the people it addressed have not been told.
    await db.flush()

    for user_id in mentioned:
        db.add(CommentMention(comment_id=comment.id, user_id=user_id))

    await notifications.for_new_comment(
        db, comment=comment, document=document, actor_id=user.id, mentioned=mentioned
    )

    await db.commit()
    await db.refresh(comment)

    return comment, user.display_name


async def _check_reply(db: AsyncSession, document_id: UUID, data: CommentCreate) -> None:
    parent = (
        await db.execute(
            select(Comment).where(Comment.id == data.parent_id, Comment.document_id == document_id)
        )
    ).scalar_one_or_none()

    if parent is None:
        raise NotFoundError("Comment not found")
    # One level, for the reason folders do not nest: a tree needs rules nothing
    # here needs. A reply to a reply says nothing another reply to the thread
    # does not already say.
    if parent.parent_id is not None:
        raise ValidationError("Replies go one level deep")
    # The anchor belongs to the thread. A reply pointing somewhere else would be
    # a different conversation wearing this one's clothes.
    if data.quote is not None:
        raise ValidationError("A reply cannot quote a passage of its own")


async def update_comment(
    db: AsyncSession, document_id: UUID, comment_id: UUID, user_id: UUID, data: CommentUpdate
) -> Authored:
    """Edit a body, resolve a thread, or both — under two different authorities.

    `model_fields_set` rather than a None check, because `resolved: false` is a
    meaningful value: it reopens a thread. Checking for None would make
    reopening impossible to express.
    """
    comment, author_name, permission = await _comment_for(db, document_id, comment_id, user_id)

    if "body" in data.model_fields_set and data.body is not None:
        # The author's alone. The document owner may delete a comment — that is
        # moderation, and it is their document — but never rewrite one, because
        # changing someone's words while their name stays on them is forgery.
        if comment.author_id != user_id:
            raise PermissionDeniedError("Only the author can edit a comment")
        comment.body = data.body

    if "resolved" in data.model_fields_set and data.resolved is not None:
        if not can_comment(permission):
            raise PermissionDeniedError("You do not have permission to resolve this thread")
        # Resolving is a property of the thread, and the thread is its root.
        if comment.parent_id is not None:
            raise ValidationError("Resolve the thread, not one of its replies")

        # func.now() resolves on the database, so two app instances with
        # slightly different clocks cannot disagree about when this happened.
        comment.resolved_at = func.now() if data.resolved else None
        comment.resolved_by = user_id if data.resolved else None

    await db.commit()
    await db.refresh(comment)

    return comment, author_name


async def delete_comment(
    db: AsyncSession, document_id: UUID, comment_id: UUID, user_id: UUID
) -> None:
    """Delete a comment. Its replies go with it.

    Cascading is right here and wrong for folders: a reply without the comment
    it answers is meaningless, whereas a document without its folder is fine.
    """
    comment, _, permission = await _comment_for(db, document_id, comment_id, user_id)

    if comment.author_id != user_id and permission is not Permission.OWNER:
        raise PermissionDeniedError("Only the author or the document owner can delete a comment")

    await db.delete(comment)
    await db.commit()
