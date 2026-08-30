"""How a document sits on paper

Revision ID: a4c81f92e703
Revises: e2c40f8b71da
Create Date: 2026-08-30

One JSONB column rather than six scalar ones. Page size, orientation and the
four margins are a single setting -- nothing reads one without the others,
nothing filters or sorts on any of them, and the set will grow the moment
headers and footers arrive. Six columns would be six migrations later.

Nullable, and NULL means "never set up, use the application's defaults". That
avoids writing a value into every existing row to say nothing, and keeps the
distinction between a document deliberately set to A4 and one that simply
predates the feature.
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "a4c81f92e703"
down_revision = "e2c40f8b71da"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "documents",
        sa.Column("page_setup", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("documents", "page_setup")
