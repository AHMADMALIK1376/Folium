import time
import uuid

import pytest
from httpx import AsyncClient

from tests.keys import make_token, other_private_key

ISSUER = "https://test.supabase.co/auth/v1"


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def test_valid_token_provisions_a_user(client: AsyncClient):
    sub = str(uuid.uuid4())
    email = f"Ada-{uuid.uuid4()}@Example.com"
    token = make_token(sub=sub, email=email, issuer=ISSUER)
    response = await client.get("/api/v1/me", headers=bearer(token))
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == sub
    assert body["email"] == email.lower()


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
    old_email = f"old-{uuid.uuid4()}@example.com"
    new_email = f"new-{uuid.uuid4()}@example.com"
    await client.get("/api/v1/me", headers=bearer(make_token(sub=sub, email=old_email, issuer=ISSUER)))
    response = await client.get(
        "/api/v1/me", headers=bearer(make_token(sub=sub, email=new_email, issuer=ISSUER))
    )
    assert response.json()["email"] == new_email


async def test_over_long_metadata_does_not_500(client: AsyncClient):
    """A 400-char full_name must be truncated before it ever reaches the DB,
    not raise a truncation error that becomes a permanent 500 for that user."""
    email = f"longmeta-{uuid.uuid4()}@example.com"
    token = make_token(
        issuer=ISSUER, email=email, user_metadata={"full_name": "A" * 400}
    )
    response = await client.get("/api/v1/me", headers=bearer(token))
    assert response.status_code == 200
    assert len(response.json()["display_name"]) <= 200


async def test_changed_avatar_updates_the_stored_row(client: AsyncClient):
    sub = str(uuid.uuid4())
    email = f"avatar-{uuid.uuid4()}@example.com"
    old_avatar = "https://img/old.png"
    new_avatar = "https://img/new.png"
    await client.get(
        "/api/v1/me",
        headers=bearer(
            make_token(sub=sub, email=email, issuer=ISSUER, user_metadata={"avatar_url": old_avatar})
        ),
    )
    response = await client.get(
        "/api/v1/me",
        headers=bearer(
            make_token(sub=sub, email=email, issuer=ISSUER, user_metadata={"avatar_url": new_avatar})
        ),
    )
    assert response.json()["avatar_url"] == new_avatar


async def test_concurrent_first_requests_provision_one_user(client: AsyncClient):
    """Two simultaneous first requests must not race into a duplicate row."""
    import asyncio

    sub = str(uuid.uuid4())
    email = f"race-{uuid.uuid4()}@example.com"
    token = make_token(sub=sub, email=email, issuer=ISSUER)

    responses = await asyncio.gather(
        client.get("/api/v1/me", headers=bearer(token)),
        client.get("/api/v1/me", headers=bearer(token)),
        return_exceptions=True,
    )

    ok = [r for r in responses if not isinstance(r, Exception) and r.status_code == 200]
    assert len(ok) == 2, f"expected both to succeed, got {responses}"
    assert {r.json()["id"] for r in ok} == {sub}


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


async def test_a_token_issued_in_our_future_is_still_accepted(client: AsyncClient):
    """A clock behind the issuer must not lock everybody out.

    This is not hypothetical. A machine three hours behind Supabase refused
    every token that project issued — every request, every user, one opaque 401
    with nothing on screen suggesting the clock. `iat` is informational in RFC
    7519; `exp` bounds a token's life and the signature proves it genuine, so
    verifying `iat` could only ever produce a false negative, and produced a
    catastrophic one.
    """
    # A unique email, like every other test that expects to provision a user:
    # make_token defaults to user@example.com, and in a full run that address is
    # already bound to a different account — which is a 409, not a 401, and a
    # confusing way to fail a test about clocks.
    token = make_token(
        issuer=ISSUER,
        email=f"skew-{uuid.uuid4()}@example.com",
        iat=int(time.time()) + 3600,
    )

    assert (await client.get("/api/v1/me", headers=bearer(token))).status_code == 200


async def test_a_token_that_has_expired_is_still_refused(client: AsyncClient):
    """The other half of the same decision: dropping the `iat` check must not
    quietly drop the `exp` check with it."""
    token = make_token(
        issuer=ISSUER,
        email=f"skew-{uuid.uuid4()}@example.com",
        expires_in=-3600,
        iat=int(time.time()) + 3600,
    )

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


async def test_jwks_outage_returns_503_not_401_or_200(client: AsyncClient):
    """An unreachable key endpoint is an infrastructure fault, not an auth
    decision, and must never let a request through."""
    from app.core import jwks as jwks_module

    original = jwks_module.jwks_cache._fetcher
    jwks_module.jwks_cache.clear()

    async def failing_fetcher():
        raise RuntimeError("supabase unreachable")

    jwks_module.jwks_cache._fetcher = failing_fetcher
    try:
        response = await client.get("/api/v1/me", headers=bearer(make_token(issuer=ISSUER)))
    finally:
        jwks_module.jwks_cache._fetcher = original
        jwks_module.jwks_cache.clear()

    assert response.status_code == 503
    assert response.status_code not in (200, 401)
