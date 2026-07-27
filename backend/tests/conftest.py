import os

os.environ.setdefault("ENVIRONMENT", "development")

import pytest
from httpx import ASGITransport, AsyncClient

from app.db.session import engine
from app.main import app


def auth_headers(email: str) -> dict[str, str]:
    """Return request headers authenticating as `email`.

    Single source of truth for test authentication. Task 6 swaps the body of
    this function for a real signed JWT; no test file changes.
    """
    return {"X-Dev-User-Email": email}


@pytest.fixture
async def client() -> AsyncClient:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture(scope="session", autouse=True)
async def dispose_engine():
    yield
    await engine.dispose()
