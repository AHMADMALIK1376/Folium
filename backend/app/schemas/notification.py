import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class NotificationOut(BaseModel):
    """One notification, carrying everything needed to read it as a sentence.

    The actor's name and the document's title are denormalised into the
    response rather than fetched per row by the client: a bell that lists ten
    notifications must not become eleven requests.
    """

    id: uuid.UUID
    kind: str
    document_id: uuid.UUID
    document_title: str
    comment_id: uuid.UUID | None
    actor_id: uuid.UUID | None
    # Null when the actor's account was deleted — actor_id is ON DELETE SET
    # NULL, because "someone commented" is still true after they are gone.
    actor_name: str | None
    read_at: datetime | None
    created_at: datetime


class UnreadCount(BaseModel):
    count: int


class MarkRead(BaseModel):
    """Which notifications to mark read.

    `None` means all of them, and an empty list means none — the two are
    different requests and must stay distinguishable, so the default is None
    rather than an empty list.
    """

    ids: list[uuid.UUID] | None = Field(default=None, max_length=200)
