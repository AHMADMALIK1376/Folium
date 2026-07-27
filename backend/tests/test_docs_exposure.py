import importlib

from fastapi.testclient import TestClient


def _app_with_environment(monkeypatch, environment: str):
    """Rebuild the app so the docs flags are re-evaluated at construction."""
    import app.config
    import app.main

    monkeypatch.setattr(app.config.settings, "environment", environment)
    return importlib.reload(app.main).app


def test_docs_are_served_in_development(monkeypatch):
    client = TestClient(_app_with_environment(monkeypatch, "development"))
    assert client.get("/docs").status_code == 200
    assert client.get("/openapi.json").status_code == 200


def test_docs_are_hidden_in_production(monkeypatch):
    client = TestClient(_app_with_environment(monkeypatch, "production"))
    assert client.get("/docs").status_code == 404
    assert client.get("/redoc").status_code == 404
    assert client.get("/openapi.json").status_code == 404


def test_health_is_still_public_in_production(monkeypatch):
    client = TestClient(_app_with_environment(monkeypatch, "production"))
    assert client.get("/health").status_code == 200
