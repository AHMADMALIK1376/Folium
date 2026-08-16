"""Add per-user document stars

Revision ID: c7b2e81a94f5
Revises: a1f4c9d27b30
Create Date: 2026-08-16

A table rather than a column on documents, because starring is per person: a
document shared with three people can be important to one and routine to the
others, and a column would make one person's shortlist everybody's.
"""

import sqlalchemy as sa

from alembic import op

revision = "c7b2e81a94f5"
down_revision = "a1f4c9d27b30"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "document_stars",
        sa.Column("user_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("document_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="CASCADE"),
        # The composite key is what makes starring idempotent: starring twice
        # cannot create two rows, so the API needs no check-then-insert and
        # cannot race with itself.
        sa.PrimaryKeyConstraint("user_id", "document_id"),
    )
    # Listing one person's starred documents is the only read this table has.
    op.create_index("ix_document_stars_user", "document_stars", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_document_stars_user", table_name="document_stars")
    op.drop_table("document_stars")
