import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Publication(Base):
    """One publish of a document to GitHub. Append-only history.

    user_id is SET NULL: the record of what reached the repo outlives the
    account that pressed the button. The document's own `last_published_*`
    columns are the current state; this table is the log.
    """

    __tablename__ = "publications"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    document_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    path: Mapped[str] = mapped_column(String(300), nullable=False)
    commit_sha: Mapped[str] = mapped_column(String(64), nullable=False)
    blob_sha: Mapped[str] = mapped_column(String(64), nullable=False)
    published_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (Index("idx_publications_document_time", "document_id", "published_at"),)
