"""Create the private `attachments` bucket this project stores files in.

Run once per Supabase project, before attachments will work:

    cd backend && .venv/Scripts/python scripts/create_storage_bucket.py

**Why this is a script and not an Alembic migration.** Buckets are not
application schema, and CI runs a plain PostgreSQL service with no `storage`
schema at all — a migration touching `storage.buckets` would fail every CI run
for a table that only exists inside Supabase.

**Why SQL rather than the Storage REST API.** This needs no service-role key, so
the bucket can be created before that key is issued, and it reuses the database
connection the application already has. Bucket setup and bucket use then have
independent credentials.

Idempotent: running it again reports the bucket already exists and changes
nothing.
"""

import asyncio
import sys

from sqlalchemy import text

from app.db.session import engine

BUCKET = "attachments"

# Enforced by Storage itself, in addition to the backend's own checks. Defence
# in depth: a bug in the API layer should not be the only thing standing between
# a caller and a 500MB upload. Kept in step with app/services/attachments.py.
MAX_BYTES = 10 * 1024 * 1024
ALLOWED_MIME_TYPES = [
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
    "application/pdf",
    "text/plain",
    "text/markdown",
    "text/csv",
]

CREATE = text(
    """
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (:id, :id, false, :limit, :types)
    on conflict (id) do nothing
    returning id
    """
)


async def main() -> int:
    async with engine.begin() as conn:
        if not (
            await conn.execute(
                text("select 1 from information_schema.schemata where schema_name = 'storage'")
            )
        ).scalar():
            print(
                "No `storage` schema on this database.\n"
                "This is a Supabase feature — point DATABASE_URL at your Supabase\n"
                "project rather than a local or CI PostgreSQL.",
                file=sys.stderr,
            )
            return 1

        created = (
            await conn.execute(
                CREATE, {"id": BUCKET, "limit": MAX_BYTES, "types": ALLOWED_MIME_TYPES}
            )
        ).scalar()

    if created:
        print(f"Created private bucket {BUCKET!r} (limit {MAX_BYTES // 1024 // 1024}MB).")
    else:
        print(f"Bucket {BUCKET!r} already exists. Nothing to do.")

    print("\nSet SUPABASE_SERVICE_ROLE_KEY in backend/.env to enable attachments.")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
