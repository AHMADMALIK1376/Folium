import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Text, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Comment(Base):
    """A comment on a document, or on a passage inside it.

    The anchor is a **text quote selector** — the quoted text plus a little of
    what surrounded it — and never a mark in the document content. Applying a
    mark would be a content write, and the whole point of the `comment`
    permission is a person who may not write the content; they would need
    exactly the capability they are denied. Character offsets drift on any edit
    above them, and Yjs relative positions would be ideal but only exist when
    collaboration is configured, which is optional here.

    So the client finds the quote and draws the highlight as a ProseMirror
    decoration, which is a view-layer overlay that touches nothing. When the
    quote can no longer be found the comment is shown as detached rather than
    reattached somewhere plausible: losing a highlight is recoverable, pointing
    confidently at the wrong paragraph is not.
    """

    __tablename__ = "comments"
    __table_args__ = (
        CheckConstraint("length(body) BETWEEN 1 AND 5000", name="ck_comments_body_length"),
        # A reply carries no quote — it inherits the thread's — and a comment
        # with no quote is a comment on the document as a whole.
        CheckConstraint(
            "parent_id IS NULL OR quote IS NULL", name="ck_comments_reply_has_no_quote"
        ),
        # Resolving is a property of the thread, and the thread is its root.
        CheckConstraint(
            "parent_id IS NULL OR resolved_at IS NULL", name="ck_comments_reply_not_resolved"
        ),
        Index("idx_comments_document_created", "document_id", "created_at"),
        Index("idx_comments_parent", "parent_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False
    )
    # SET NULL, not CASCADE, and for the reason document_versions.created_by is:
    # a discussion outlives the account that took part in it. Deleting a person
    # must not silently rewrite a conversation other people are still reading.
    author_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    # CASCADE here, unlike folders: a reply without the comment it answers is
    # meaningless, which is exactly the case where cascading is right.
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("comments.id", ondelete="CASCADE"), nullable=True
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)

    quote: Mapped[str | None] = mapped_column(Text, nullable=True)
    prefix: Mapped[str | None] = mapped_column(Text, nullable=True)
    suffix: Mapped[str | None] = mapped_column(Text, nullable=True)

    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_by: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
