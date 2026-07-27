import time
import uuid

import jwt
import pytest

from app.core.exceptions import JwksUnavailableError
from app.core.jwks import JwksCache
from app.core.security import InvalidTokenError, verify_token
from tests.keys import OMIT, TEST_KID, jwks_document, make_token, other_private_key, private_key

ISSUER = "https://test.supabase.co/auth/v1"


def cache_for(document=None, fail=False):
    async def fetcher():
        if fail:
            raise RuntimeError("down")
        return document if document is not None else jwks_document()

    return JwksCache(fetcher=fetcher, ttl_seconds=600)


@pytest.fixture(autouse=True)
def _issuer(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "supabase_url", "https://test.supabase.co")


async def test_valid_token_yields_claims():
    sub = str(uuid.uuid4())
    token = make_token(sub=sub, email="Ada@Example.com", issuer=ISSUER)
    claims = await verify_token(token, cache=cache_for())
    assert claims.sub == uuid.UUID(sub)
    assert claims.email == "ada@example.com"


async def test_display_name_prefers_full_name():
    token = make_token(issuer=ISSUER, user_metadata={"full_name": "Ada L", "name": "ada"})
    claims = await verify_token(token, cache=cache_for())
    assert claims.display_name == "Ada L"


async def test_display_name_falls_back_to_name_then_email_local_part():
    token = make_token(issuer=ISSUER, user_metadata={"name": "ada"})
    assert (await verify_token(token, cache=cache_for())).display_name == "ada"

    token = make_token(email="grace@example.com", issuer=ISSUER)
    assert (await verify_token(token, cache=cache_for())).display_name == "grace"


async def test_avatar_url_is_extracted_when_present():
    token = make_token(issuer=ISSUER, user_metadata={"avatar_url": "https://img/a.png"})
    assert (await verify_token(token, cache=cache_for())).avatar_url == "https://img/a.png"

    token = make_token(issuer=ISSUER)
    assert (await verify_token(token, cache=cache_for())).avatar_url is None


async def test_expired_token_is_rejected():
    token = make_token(issuer=ISSUER, expires_in=-120)
    with pytest.raises(InvalidTokenError):
        await verify_token(token, cache=cache_for())


async def test_token_signed_by_an_unrelated_key_is_rejected():
    token = make_token(issuer=ISSUER, key=other_private_key)
    with pytest.raises(InvalidTokenError):
        await verify_token(token, cache=cache_for())


async def test_wrong_issuer_is_rejected():
    token = make_token(issuer="https://evil.example.com/auth/v1")
    with pytest.raises(InvalidTokenError):
        await verify_token(token, cache=cache_for())


async def test_wrong_audience_is_rejected():
    token = make_token(issuer=ISSUER, audience="anon")
    with pytest.raises(InvalidTokenError):
        await verify_token(token, cache=cache_for())


async def test_missing_sub_is_rejected():
    token = make_token(issuer=ISSUER, sub="")
    with pytest.raises(InvalidTokenError):
        await verify_token(token, cache=cache_for())


async def test_non_uuid_sub_is_rejected():
    token = make_token(sub="not-a-uuid", issuer=ISSUER)
    with pytest.raises(InvalidTokenError):
        await verify_token(token, cache=cache_for())


async def test_absent_email_claim_is_rejected():
    token = make_token(issuer=ISSUER, email=OMIT)
    with pytest.raises(InvalidTokenError):
        await verify_token(token, cache=cache_for())


async def test_null_email_claim_is_rejected():
    """Present-but-null is a different input from absent; both must fail."""
    token = make_token(issuer=ISSUER, email=None)
    with pytest.raises(InvalidTokenError):
        await verify_token(token, cache=cache_for())


async def test_hs256_token_signed_with_the_public_key_is_rejected():
    """The algorithm-confusion attack.

    The signing key's public half is published at a well-known URL. If the
    verifier accepted HMAC algorithms, an attacker could sign a forged token
    using that public key as the shared secret and be accepted as any user.

    Hand-forged with raw HMAC rather than jwt.encode, which guards against
    this construction. An attacker is under no such constraint, so the guard
    must live in our verifier, not in the library that builds the token.
    """
    import base64
    import hashlib
    import hmac
    import json

    from cryptography.hazmat.primitives import serialization

    public_pem = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )

    def b64(raw: bytes) -> str:
        return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()

    header = b64(
        json.dumps({"alg": "HS256", "typ": "JWT", "kid": TEST_KID}, separators=(",", ":")).encode()
    )
    payload = b64(
        json.dumps(
            {
                "sub": str(uuid.uuid4()),
                "email": "attacker@example.com",
                "iss": ISSUER,
                "aud": "authenticated",
                "exp": int(time.time()) + 3600,
            },
            separators=(",", ":"),
        ).encode()
    )
    signing_input = f"{header}.{payload}".encode()
    signature = hmac.new(public_pem, signing_input, hashlib.sha256).digest()
    forged = f"{header}.{payload}.{b64(signature)}"

    with pytest.raises(InvalidTokenError):
        await verify_token(forged, cache=cache_for())


async def test_alg_none_is_rejected():
    """Built by hand rather than with jwt.encode, which refuses to emit an
    unsigned token. An attacker is under no such constraint."""
    import base64
    import json

    def b64(data: dict) -> str:
        raw = json.dumps(data, separators=(",", ":")).encode()
        return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()

    header = b64({"alg": "none", "typ": "JWT", "kid": "test-key-1"})
    payload = b64(
        {"sub": str(uuid.uuid4()), "email": "a@example.com", "iss": ISSUER, "aud": "authenticated"}
    )
    forged = f"{header}.{payload}."

    with pytest.raises(InvalidTokenError):
        await verify_token(forged, cache=cache_for())


async def test_garbage_token_is_rejected():
    with pytest.raises(InvalidTokenError):
        await verify_token("not.a.jwt", cache=cache_for())


async def test_missing_kid_header_is_rejected():
    token = make_token(issuer=ISSUER, kid=OMIT)
    with pytest.raises(InvalidTokenError):
        await verify_token(token, cache=cache_for())


async def test_unknown_kid_is_rejected():
    token = make_token(issuer=ISSUER, kid="rotated")
    with pytest.raises(InvalidTokenError):
        await verify_token(token, cache=cache_for())


async def test_jwks_unavailable_propagates_and_is_not_an_auth_failure():
    """Must surface as JwksUnavailableError (503), never InvalidTokenError (401)
    and never success. Failing open here would defeat authentication entirely."""
    token = make_token(issuer=ISSUER)
    with pytest.raises(JwksUnavailableError):
        await verify_token(token, cache=cache_for(fail=True))
