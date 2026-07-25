import pytest
from httpx import AsyncClient

from app.config import Settings, settings


async def test_missing_header_is_unauthorized(client: AsyncClient):
    response = await client.get("/api/v1/me")
    assert response.status_code == 401


async def test_dev_header_resolves_a_user(client: AsyncClient):
    response = await client.get("/api/v1/me", headers={"X-Dev-User-Email": "Alice@Example.com"})
    assert response.status_code == 200
    assert response.json()["email"] == "alice@example.com"


async def test_same_email_returns_the_same_user(client: AsyncClient):
    headers = {"X-Dev-User-Email": "stable@example.com"}
    first = await client.get("/api/v1/me", headers=headers)
    second = await client.get("/api/v1/me", headers=headers)
    assert first.json()["id"] == second.json()["id"]


async def test_dev_header_is_rejected_outside_development(client: AsyncClient, monkeypatch):
    monkeypatch.setattr(settings, "environment", "production")
    response = await client.get("/api/v1/me", headers={"X-Dev-User-Email": "a@example.com"})
    assert response.status_code == 401


def test_unset_environment_defaults_to_production(monkeypatch):
    monkeypatch.delenv("ENVIRONMENT", raising=False)
    fresh_settings = Settings(_env_file=None)
    assert fresh_settings.environment == "production"
    assert fresh_settings.is_development is False
