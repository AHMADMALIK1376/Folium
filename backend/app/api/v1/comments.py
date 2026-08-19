from uuid import UUID

from fastapi import APIRouter, Response, status

from app.api.deps import CurrentUser, DbSession
from app.models import Comment
from app.schemas.comment import CommentCreate, CommentOut, CommentThread, CommentUpdate
from app.services import comments as service

router = APIRouter(prefix="/documents/{document_id}/comments", tags=["comments"])


def _out(comment: Comment, author_name: str | None) -> CommentOut:
    return CommentOut(
        id=comment.id,
        document_id=comment.document_id,
        parent_id=comment.parent_id,
        body=comment.body,
        quote=comment.quote,
        prefix=comment.prefix,
        suffix=comment.suffix,
        author_id=comment.author_id,
        author_name=author_name,
        resolved_at=comment.resolved_at,
        resolved_by=comment.resolved_by,
        created_at=comment.created_at,
        updated_at=comment.updated_at,
    )


@router.get("", response_model=list[CommentThread])
async def list_comments(document_id: UUID, db: DbSession, user: CurrentUser) -> list[CommentThread]:
    """Threads on a document, oldest first, each with its replies.

    Nested here rather than in SQL: the service returns every comment in one
    query, and grouping one level deep is a dict lookup, not a reason for a
    second round trip.
    """
    rows = await service.list_threads(db, document_id, user.id)

    threads: dict[UUID, CommentThread] = {}
    replies: list[tuple[UUID, CommentOut]] = []

    for comment, author_name in rows:
        out = _out(comment, author_name)
        if comment.parent_id is None:
            threads[comment.id] = CommentThread(**out.model_dump(), replies=[])
        else:
            replies.append((comment.parent_id, out))

    for parent_id, reply in replies:
        thread = threads.get(parent_id)
        if thread is not None:
            thread.replies.append(reply)
        else:
            # Unreachable while parent_id CASCADEs, and promoted rather than
            # dropped if it ever happens: a reply that vanishes hides the bug
            # along with someone's words.
            threads[reply.id] = CommentThread(**reply.model_dump(), replies=[])

    return list(threads.values())


@router.post("", response_model=CommentOut, status_code=status.HTTP_201_CREATED)
async def create_comment(
    document_id: UUID, data: CommentCreate, db: DbSession, user: CurrentUser
) -> CommentOut:
    comment, author_name = await service.create_comment(db, document_id, user, data)

    return _out(comment, author_name)


@router.patch("/{comment_id}", response_model=CommentOut)
async def update_comment(
    document_id: UUID, comment_id: UUID, data: CommentUpdate, db: DbSession, user: CurrentUser
) -> CommentOut:
    """Edit a body, resolve a thread, or both.

    The two fields carry different authorities — the body is the author's, the
    resolved flag is anyone who may comment — and the service checks each
    separately rather than gating the whole request on one of them.
    """
    comment, author_name = await service.update_comment(db, document_id, comment_id, user.id, data)

    return _out(comment, author_name)


@router.delete("/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comment(
    document_id: UUID, comment_id: UUID, db: DbSession, user: CurrentUser
) -> Response:
    """Delete a comment. Its replies go with it."""
    await service.delete_comment(db, document_id, comment_id, user.id)

    return Response(status_code=status.HTTP_204_NO_CONTENT)
