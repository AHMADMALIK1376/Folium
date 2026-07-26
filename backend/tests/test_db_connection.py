from sqlalchemy import text

from app.db.session import AsyncSessionLocal


async def test_database_is_reachable():
    async with AsyncSessionLocal() as session:
        result = await session.execute(text("SELECT 1"))
        assert result.scalar() == 1
