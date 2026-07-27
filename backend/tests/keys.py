"""Local signing keys for tests.

The suite mints its own tokens against a keypair generated here, so no test
needs network access or real Supabase credentials. Verification in production
and in tests runs the identical code path; only the source of the public key
differs.
"""

import json
import time
import uuid
from typing import Any

import jwt
from cryptography.hazmat.primitives.asymmetric import ec
from jwt.algorithms import ECAlgorithm

TEST_KID = "test-key-1"

private_key = ec.generate_private_key(ec.SECP256R1())

# A second, unrelated keypair. Signing with this produces a token whose
# signature cannot validate against the published JWKS.
other_private_key = ec.generate_private_key(ec.SECP256R1())


def jwks_document() -> dict[str, Any]:
    """Return a JWKS document publishing the public half of `private_key`."""
    jwk = json.loads(ECAlgorithm.to_jwk(private_key.public_key()))
    jwk.update({"kid": TEST_KID, "alg": "ES256", "use": "sig"})
    return {"keys": [jwk]}


def make_token(
    sub: str | None = None,
    email: str = "user@example.com",
    issuer: str | None = None,
    audience: str | None = "authenticated",
    algorithm: str = "ES256",
    key: Any = None,
    headers: dict[str, Any] | None = None,
    expires_in: int = 3600,
    **claims: Any,
) -> str:
    """Mint a signed token. Every field is overridable so negative tests can
    produce expired, mis-issued, mis-audienced, or wrongly signed tokens."""
    now = int(time.time())
    payload: dict[str, Any] = {
        # `is None` rather than a truthiness check: sub="" must stay empty so a
        # test can assert an empty sub is rejected, not be replaced by a UUID.
        "sub": str(uuid.uuid4()) if sub is None else sub,
        "email": email,
        "iat": now,
        "exp": now + expires_in,
    }
    if issuer is not None:
        payload["iss"] = issuer
    if audience is not None:
        payload["aud"] = audience
    payload.update(claims)

    signing_key = key if key is not None else private_key
    return jwt.encode(
        payload,
        signing_key,
        algorithm=algorithm,
        headers={"kid": TEST_KID, **(headers or {})},
    )
