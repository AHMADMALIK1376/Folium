import uuid

import pytest
from httpx import AsyncClient

from tests.keys import make_token, other_private_key

ISSUER = "https://test.supabase.co/auth/v1"


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def test_valid_token_provisions_a_user(client: AsyncClient):
    sub = str(uuid.uuid4())
    token = make_token(sub=sub, email="Ada@Example.com", issuer=ISSUER)
    response = await client.get("/api/v1/me", headers=bearer(token))
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == sub
    assert body["email"] == "ada@example.com"


async def test_display_name_comes_from_user_metadata(client: AsyncClient):
    token = make_token(
        issuer=ISSUER,
        email=f"metadata-{uuid.uuid4()}@example.com",
        user_metadata={"full_name": "Ada Lovelace"},
    )
    response = await client.get("/api/v1/me", headers=bearer(token))
    assert response.json()["display_name"] == "Ada Lovelace"


async def test_same_sub_reuses_the_same_user(client: AsyncClient):
    sub = str(uuid.uuid4())
    email = f"reuse-{uuid.uuid4()}@example.com"
    first = await client.get("/api/v1/me", headers=bearer(make_token(sub=sub, email=email, issuer=ISSUER)))
    second = await client.get("/api/v1/me", headers=bearer(make_token(sub=sub, email=email, issuer=ISSUER)))
    assert first.json()["id"] == second.json()["id"] == sub


async def test_changed_email_updates_the_stored_row(client: AsyncClient):
    sub = str(uuid.uuid4())
    await client.get("/api/v1/me", headers=bearer(make_token(sub=sub, email="old@example.com", issuer=ISSUER)))
    response = await client.get(
        "/api/v1/me", headers=bearer(make_token(sub=sub, email="new@example.com", issuer=ISSUER))
    )
    assert response.json()["email"] == "new@example.com"


async def test_missing_authorization_header_is_401(client: AsyncClient):
    response = await client.get("/api/v1/me")
    assert response.status_code == 401


async def test_dev_header_no_longer_authenticates(client: AsyncClient):
    """The Phase 1 stand-in must be completely gone, not merely gated."""
    response = await client.get("/api/v1/me", headers={"X-Dev-User-Email": "ada@example.com"})
    assert response.status_code == 401


@pytest.mark.parametrize(
    "header",
    [{"Authorization": "Bearer"}, {"Authorization": "abc.def.ghi"}, {"Authorization": "Basic xyz"}],
)
async def test_malformed_authorization_header_is_401(client: AsyncClient, header):
    response = await client.get("/api/v1/me", headers=header)
    assert response.status_code == 401


async def test_expired_token_is_401(client: AsyncClient):
    token = make_token(issuer=ISSUER, expires_in=-60)
    assert (await client.get("/api/v1/me", headers=bearer(token))).status_code == 401


async def test_token_from_an_unrelated_key_is_401(client: AsyncClient):
    token = make_token(issuer=ISSUER, key=other_private_key)
    assert (await client.get("/api/v1/me", headers=bearer(token))).status_code == 401


async def test_wrong_issuer_is_401(client: AsyncClient):
    token = make_token(issuer="https://evil.example.com/auth/v1")
    assert (await client.get("/api/v1/me", headers=bearer(token))).status_code == 401


async def test_all_auth_failures_share_one_response_body(client: AsyncClient):
    """A varying message would tell an attacker which part of their forgery
    to fix next."""
    bodies = {
        (await client.get("/api/v1/me")).json()["detail"],
        (await client.get("/api/v1/me", headers=bearer(make_token(issuer=ISSUER, expires_in=-60)))).json()["detail"],
        (await client.get("/api/v1/me", headers=bearer(make_token(issuer="https://evil/auth/v1")))).json()["detail"],
        (await client.get("/api/v1/me", headers=bearer(make_token(issuer=ISSUER, key=other_private_key)))).json()["detail"],
    }
    assert len(bodies) == 1


async def test_documents_route_also_requires_a_valid_token(client: AsyncClient):
    assert (await client.get("/api/v1/documents")).status_code == 401
    token = make_token(issuer=ISSUER, email=f"docs-{uuid.uuid4()}@example.com")
    assert (await client.get("/api/v1/documents", headers=bearer(token))).status_code == 200
