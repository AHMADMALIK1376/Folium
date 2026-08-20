import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

BODY_MAX = 5000
QUOTE_MAX = 2000
CONTEXT_MAX = 200


def _not_blank(value: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise ValueError("A comment needs something in it")
    return cleaned


class CommentCreate(BaseModel):
    """A new comment, or a reply to one.

    The anchor is a text quote selector, not an offset and not a mark: see
    `app.models.comment`. `quote` absent means the comment is about the document
    as a whole, which is a real thing people want and costs one nullable column.
    """

    body: str = Field(min_length=1, max_length=BODY_MAX)
    quote: str | None = Field(default=None, max_length=QUOTE_MAX)
    # A little of what surrounded the quote, so a phrase that appears twice can
    # be told apart from itself.
    prefix: str | None = Field(default=None, max_length=CONTEXT_MAX)
    suffix: str | None = Field(default=None, max_length=CONTEXT_MAX)
    parent_id: uuid.UUID | None = None
    # Who this comment addressed, said outright rather than scraped from the
    # body. Parsing would have to answer where `@Ada Lovelace` ends, and display
    # names contain spaces, so there is no reliable answer. The client picked
    # these people from a list; it already knows.
    #
    # Input only — CommentOut does not echo it back. The body already carries
    # the readable form, "@Ada Lovelace", so returning the ids would add a query
    # per read to tell the client something it can see.
    mention_user_ids: list[uuid.UUID] = Field(default_factory=list, max_length=20)

    @field_validator("body")
    @classmethod
    def body_not_blank(cls, v: str) -> str:
        return _not_blank(v)


class CommentUpdate(BaseModel):
    """Two fields with two different authorities.

    The body belongs to its author and to nobody else — not even the document
    owner, because editing someone's words while leaving their name on them is
    forgery rather than moderation. `resolved` belongs to anyone who may
    comment. Each is therefore checked separately, and `model_fields_set` tells
    "not sent" from "sent as false" — the same mechanism folders needed, for the
    same reason: false is a meaningful value, so its absence must be detectable.
    """

    body: str | None = Field(default=None, min_length=1, max_length=BODY_MAX)
    resolved: bool | None = None

    @field_validator("body")
    @classmethod
    def body_not_blank(cls, v: str | None) -> str | None:
        return None if v is None else _not_blank(v)


class CommentOut(BaseModel):
    id: uuid.UUID
    document_id: uuid.UUID
    parent_id: uuid.UUID | None
    body: str
    quote: str | None
    prefix: str | None
    suffix: str | None
    author_id: uuid.UUID | None
    # Null when the author's account was deleted — author_id is ON DELETE SET
    # NULL, so a discussion outlives the account that took part in it. Render
    # "Unknown" rather than dropping the comment.
    author_name: str | None
    resolved_at: datetime | None
    resolved_by: uuid.UUID | None
    created_at: datetime
    updated_at: datetime


class CommentThread(CommentOut):
    """A root comment with its replies, oldest first.

    Nested one level, because that is all the model allows: a reply carries no
    quote and cannot be resolved, so there is nothing for a reply to a reply to
    mean that a further reply to the thread does not already say.
    """

    replies: list[CommentOut] = []
