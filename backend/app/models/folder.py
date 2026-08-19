import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Folder(Base):
    """A folder of one person's own documents.

    Organisation, not access: filing a document changes nothing about who can
    read it. A shared folder would give a document two sources of truth about
    its permissions — its shares and its folder's — and when those disagree the
    surprise is always "a document I thought was private is not".
    """

    __tablename__ = "folders"
    __table_args__ = (
        # One person cannot have two folders of the same name. Two "Clients"
        # in a sidebar is a bug report waiting to happen.
        UniqueConstraint("owner_id", "name", name="uq_folders_owner_name"),
    )

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
