"""Add folders

Revision ID: d3e8f1a72c46
Revises: c7b2e81a94f5
Create Date: 2026-08-17

documents.folder_id is ON DELETE SET NULL rather than CASCADE, deliberately.
Deleting a folder is a tidying action and tidying must never destroy work — the
documents return to being unfiled. There is already a trash for deletion.
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "d3e8f1a72c46"
down_revision = "c7b2e81a94f5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "folders",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("owner_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("owner_id", "name", name="uq_folders_owner_name"),
    )
    op.create_index("ix_folders_owner_id", "folders", ["owner_id"])

    op.add_column("documents", sa.Column("folder_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_documents_folder_id", "documents", "folders", ["folder_id"], ["id"], ondelete="SET NULL"
    )
    op.create_index("ix_documents_folder_id", "documents", ["folder_id"])


def downgrade() -> None:
    op.drop_index("ix_documents_folder_id", table_name="documents")
    op.drop_constraint("fk_documents_folder_id", "documents", type_="foreignkey")
    op.drop_column("documents", "folder_id")
    op.drop_index("ix_folders_owner_id", table_name="folders")
    op.drop_table("folders")
