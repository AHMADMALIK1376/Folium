"""Delete test-generated accounts and their data.

Local development shares a database with production (the free tier allows one
project), so every test run leaves roughly fifty throwaway users behind. This
removes them without touching real accounts.

It only ever deletes users whose email ends in a domain listed in
TEST_EMAIL_DOMAINS. Those domains are reserved by RFC 2606 precisely so they
can never belong to a real person, which is what makes this safe to run against
a database holding live data. Documents and shares disappear with their owner
through the existing ON DELETE CASCADE.

Usage:
    python scripts/clean_test_data.py            # report only, deletes nothing
    python scripts/clean_test_data.py --yes      # actually delete
"""

import argparse
import asyncio
import sys
from pathlib import Path

from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db.session import AsyncSessionLocal, engine

# RFC 2606 reserves these; they cannot be registered by anyone, so a matching
# address is always synthetic. Do not add a domain a real user could own.
TEST_EMAIL_DOMAINS = ("@example.com", "@example.org", "@example.net")

_MATCH = " OR ".join(f"email LIKE '%{d}'" for d in TEST_EMAIL_DOMAINS)


async def main(delete: bool) -> int:
    try:
        return await _run(delete)
    finally:
        # Dispose inside this loop. Doing it from a second asyncio.run() would
        # hand asyncpg a closed loop and raise on the way out.
        await engine.dispose()


async def _run(delete: bool) -> int:
    async with AsyncSessionLocal() as session:
        total = (await session.execute(text("SELECT count(*) FROM users"))).scalar()
        doomed = (
            await session.execute(text(f"SELECT count(*) FROM users WHERE {_MATCH}"))
        ).scalar()
        docs = (
            await session.execute(
                text(
                    "SELECT count(*) FROM documents WHERE owner_id IN "
                    f"(SELECT id FROM users WHERE {_MATCH})"
                )
            )
        ).scalar()

        keep = total - doomed
        print(f"users in database   : {total}")
        print(f"test accounts       : {doomed}")
        print(f"their documents     : {docs}")
        print(f"real accounts kept  : {keep}")

        if doomed == 0:
            print("\nNothing to clean.")
            return 0

        if not delete:
            print("\nDry run. Re-run with --yes to delete the test accounts.")
            return 0

        await session.execute(text(f"DELETE FROM users WHERE {_MATCH}"))
        await session.commit()

        remaining = (await session.execute(text("SELECT count(*) FROM users"))).scalar()
        print(f"\nDeleted {doomed} test accounts. {remaining} users remain.")

        if remaining != keep:
            print("WARNING: remaining count does not match the expected figure.")
            return 1
        return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--yes", action="store_true", help="perform the deletion instead of reporting"
    )
    args = parser.parse_args()
    raise SystemExit(asyncio.run(main(args.yes)))
