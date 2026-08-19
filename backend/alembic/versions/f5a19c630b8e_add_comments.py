"""Add comments

Revision ID: f5a19c630b8e
Revises: d3e8f1a72c46
Create Date: 2026-08-20

The anchor is a text quote selector — quote, prefix, suffix — and not a mark in
the document content. A mark would be a content write, and the `comment`
permission exists precisely for someone who may not write the content.

author_id and resolved_by are ON DELETE SET NULL: a discussion outlives the
account that took part in it. parent_id is CASCADE, because a reply without the
comment it answers is meaningless.
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "f5a19c630b8e"
down_revision = "d3e8f1a72c46"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "comments",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("document_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("author_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("parent_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("quote", sa.Text(), nullable=True),
        sa.Column("prefix", sa.Text(), nullable=True),
        sa.Column("suffix", sa.Text(), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["resolved_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["parent_id"], ["comments.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint("length(body) BETWEEN 1 AND 5000", name="ck_comments_body_length"),
        sa.CheckConstraint(
            "parent_id IS NULL OR quote IS NULL", name="ck_comments_reply_has_no_quote"
        ),
        sa.CheckConstraint(
            "parent_id IS NULL OR resolved_at IS NULL", name="ck_comments_reply_not_resolved"
        ),
    )
    op.create_index("idx_comments_document_created", "comments", ["document_id", "created_at"])
    op.create_index("idx_comments_parent", "comments", ["parent_id"])


def downgrade() -> None:
    op.drop_index("idx_comments_parent", table_name="comments")
    op.drop_index("idx_comments_document_created", table_name="comments")
    op.drop_table("comments")
