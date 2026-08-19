import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

# The four things worth telling someone about. Not edits, resolutions,
# deletions or filings: each is either routine or something the person doing it
# already knows. A list that fills with things nobody wanted is one people stop
# reading, and then the four that matter are lost with the rest.
KINDS = ("comment", "reply", "mention", "share")


class Notification(Base):
    """Something happened, and one person should hear about it.

    Never created through the API. A notification is a consequence of another
    action and is written in the same transaction as the thing that caused it,
    so there is no state where the comment exists and the notification does not.
    """

    __tablename__ = "notifications"
    __table_args__ = (
        CheckConstraint(
            "kind IN ('comment', 'reply', 'mention', 'share')", name="ck_notifications_kind"
        ),
        # Nobody is ever notified about their own action. Enforced in the
        # service, and again here: this is the rule most likely to be got wrong
        # and the most obviously wrong when it is.
        CheckConstraint("actor_id IS NULL OR actor_id <> user_id", name="ck_notifications_not_self"),
        Index("idx_notifications_user_created", "user_id", "created_at"),
        # The unread count is the most frequent query in the app once this
        # exists — every page load asks it.
        Index("idx_notifications_unread", "user_id", "read_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    # SET NULL like every other actor column here: "someone commented" is still
    # true after the account is gone.
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    # Both CASCADE, and that is the opposite of the folders rule for the
    # opposite reason: a notification exists *because* of the thing it points
    # at, and one pointing at a deleted comment promises something to look at
    # and delivers a 404.
    document_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False
    )
    comment_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("comments.id", ondelete="CASCADE"), nullable=True
    )
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class CommentMention(Base):
    """Who a comment addressed.

    A row rather than text scraped out of the body. Parsing would have to answer
    where `@Ada Lovelace` ends, and display names contain spaces, so there is no
    reliable answer. The client already knows exactly who was picked from the
    list, so it says so.
    """

    __tablename__ = "comment_mentions"

    comment_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("comments.id", ondelete="CASCADE"),
        primary_key=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
