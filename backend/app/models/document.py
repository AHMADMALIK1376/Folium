import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.constants import empty_doc
from app.db.base import Base


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    content: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=empty_doc)
    content_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    # SET NULL, not CASCADE: deleting a folder is tidying, and tidying must
    # never destroy work. The documents come back unfiled instead.
    folder_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("folders.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # A template is a document with a flag on it, not a separate kind of thing.
    # It is written in the same editor, kept in the same list and exported the
    # same way; the flag only says "offer this when starting something new".
    is_template: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    # How the document sits on paper: size, orientation and the four margins.
    # One jsonb column because nothing reads any of them without the others and
    # nothing filters on them -- and because the set grows the moment headers
    # and footers arrive. NULL means never set up, so the editor applies its own
    # defaults rather than the row asserting a page size nobody chose.
    page_setup: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    __table_args__ = (Index("idx_documents_owner", "owner_id"),)
