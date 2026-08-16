"""Add a full-text search index over document titles and bodies

Revision ID: a1f4c9d27b30
Revises: be464b101dc3
Create Date: 2026-08-16

No new column: `content_text` has existed since the initial schema and is
maintained by create, update and version restore. This is the index that makes
it searchable.

The expression is indexed rather than the raw columns, and it must be IMMUTABLE
for Postgres to accept it — which is why the regconfig is spelled out as
'english' rather than left to default. `to_tsvector(text)` uses
`default_text_search_config`, a session setting, and is therefore only STABLE.
"""

from alembic import op

revision = "a1f4c9d27b30"
down_revision = "be464b101dc3"
branch_labels = None
depends_on = None

# Title first and weighted 'A', body 'B': if the words are in the title, that is
# the document, and ts_rank uses the weights to say so.
SEARCH_EXPRESSION = (
    "setweight(to_tsvector('english', coalesce(title, '')), 'A') || "
    "setweight(to_tsvector('english', coalesce(content_text, '')), 'B')"
)


def upgrade() -> None:
    op.execute(
        f"CREATE INDEX ix_documents_search ON documents USING GIN (({SEARCH_EXPRESSION}))"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_documents_search")
