import os

os.environ.setdefault("ENVIRONMENT", "development")

import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.db.session import engine
from app.main import app


def auth_headers(email: str, sub: str | None = None, **claims) -> dict[str, str]:
    """Return headers authenticating as `email` with a real signed JWT.

    Deterministic sub per email so repeated calls in one test resolve to the
    same user.
    """
    from tests.keys import make_token

    resolved = sub or str(uuid.uuid5(uuid.NAMESPACE_URL, f"folium-test:{email}"))
    token = make_token(
        sub=resolved,
        email=email,
        issuer="https://test.supabase.co/auth/v1",
        **claims,
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def client() -> AsyncClient:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture(scope="session", autouse=True)
async def dispose_engine():
    yield
    await engine.dispose()


@pytest.fixture(autouse=True)
def _test_auth(monkeypatch):
    from app.api.deps import forget_cached_users
    from app.config import settings
    from app.core import jwks as jwks_module
    from tests.keys import jwks_document

    monkeypatch.setattr(settings, "supabase_url", "https://test.supabase.co")

    # Resolved users are cached in process for a minute, so a case that reuses
    # an email from a previous one would otherwise be served a user the
    # database no longer has — and a case asserting on a *changed* profile
    # would see the old one.
    forget_cached_users()

    async def fetcher():
        return jwks_document()

    jwks_module.jwks_cache._fetcher = fetcher
    jwks_module.jwks_cache.clear()
    yield
    jwks_module.jwks_cache.clear()
    forget_cached_users()
