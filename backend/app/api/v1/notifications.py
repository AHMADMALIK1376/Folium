from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.schemas.notification import MarkRead, NotificationOut, UnreadCount
from app.services import notifications as service

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationOut])
async def list_notifications(db: DbSession, user: CurrentUser) -> list[NotificationOut]:
    """This person's notifications, newest first.

    Filtered by what they can see *now*. A notification written while a document
    was shared with them still holds its title, and showing it after the share
    was revoked would leak the document to someone who has lost access.
    """
    return [
        NotificationOut(
            id=notification.id,
            kind=notification.kind,
            document_id=notification.document_id,
            document_title=title,
            comment_id=notification.comment_id,
            actor_id=notification.actor_id,
            actor_name=actor_name,
            read_at=notification.read_at,
            created_at=notification.created_at,
        )
        for notification, actor_name, title in await service.list_for(db, user.id)
    ]


@router.get("/unread-count", response_model=UnreadCount)
async def get_unread_count(db: DbSession, user: CurrentUser) -> UnreadCount:
    """The number on the bell.

    Its own route rather than a count over the list: this is asked on every page
    load and every poll, and it must not carry fifty rows to answer with one
    integer.
    """
    return UnreadCount(count=await service.unread_count(db, user.id))


@router.post("/read", response_model=UnreadCount)
async def mark_read(data: MarkRead, db: DbSession, user: CurrentUser) -> UnreadCount:
    """Mark some notifications read, or all of them when `ids` is absent.

    Returns the count that remains, so the caller does not have to ask again to
    update the badge it just changed.
    """
    await service.mark_read(db, user.id, data.ids)

    return UnreadCount(count=await service.unread_count(db, user.id))
