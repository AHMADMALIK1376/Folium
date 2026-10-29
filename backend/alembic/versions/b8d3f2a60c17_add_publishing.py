"""Publish documents to GitHub

Revision ID: b8d3f2a60c17
Revises: a4c81f92e703
Create Date: 2026-10-29

The four document columns are the current state (where it went, and the blob
sha that detects an edit made in GitHub). `publications` is the append-only
log. user_id is SET NULL so the history outlives the account.
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "b8d3f2a60c17"
down_revision = "a4c81f92e703"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("documents", sa.Column("github_path", sa.String(300), nullable=True))
    op.add_column("documents", sa.Column("last_published_blob_sha", sa.String(64), nullable=True))
    op.add_column(
        "documents", sa.Column("last_published_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "documents",
        sa.Column(
            "last_published_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_table(
        "publications",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("document_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("path", sa.String(300), nullable=False),
        sa.Column("commit_sha", sa.String(64), nullable=False),
        sa.Column("blob_sha", sa.String(64), nullable=False),
        sa.Column(
            "published_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "idx_publications_document_time", "publications", ["document_id", "published_at"]
    )


def downgrade() -> None:
    op.drop_index("idx_publications_document_time", table_name="publications")
    op.drop_table("publications")
    op.drop_column("documents", "last_published_by")
    op.drop_column("documents", "last_published_at")
    op.drop_column("documents", "last_published_blob_sha")
    op.drop_column("documents", "github_path")
