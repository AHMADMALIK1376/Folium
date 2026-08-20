"""Mark a document as a template

Revision ID: e2c40f8b71da
Revises: b71e4d0c92af
Create Date: 2026-08-20

A flag rather than a table. A template is written in the same editor, kept in
the same list and exported the same way as any other document; the only thing
that differs is whether it is offered when starting something new.
"""

import sqlalchemy as sa

from alembic import op

revision = "e2c40f8b71da"
down_revision = "b71e4d0c92af"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "documents",
        sa.Column(
            "is_template",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    # Partial: the overwhelming majority of documents are not templates, so an
    # index over all of them would be mostly dead weight.
    op.create_index(
        "ix_documents_templates",
        "documents",
        ["owner_id"],
        postgresql_where=sa.text("is_template"),
    )


def downgrade() -> None:
    op.drop_index("ix_documents_templates", table_name="documents")
    op.drop_column("documents", "is_template")
