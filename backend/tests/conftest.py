import pytest
from httpx import ASGITransport, AsyncClient

from app.db.session import engine
from app.main import app


@pytest.fixture
async def client() -> AsyncClient:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture(scope="session", autouse=True)
async def dispose_engine():
    yield
    await engine.dispose()
