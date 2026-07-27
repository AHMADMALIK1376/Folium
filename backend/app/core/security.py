"""Supabase JWT verification.

Every failure raises InvalidTokenError. Callers translate that into a single
generic 401: telling a caller *why* their token was rejected hands an attacker
free reconnaissance.
"""

import logging
import uuid
from dataclasses import dataclass

import jwt

from app.config import settings
from app.core.jwks import jwks_cache

logger = logging.getLogger(__name__)

# Pinned allowlist. NEVER derive this from the token's own `alg` header, and
# never add an HMAC algorithm: the public key is published, so accepting HS*
# would let an attacker sign a forged token with it as the shared secret.
ALLOWED_ALGORITHMS = ["ES256", "RS256"]


class InvalidTokenError(Exception):
    """The token is absent, malformed, or fails verification."""


@dataclass(frozen=True)
class TokenClaims:
    sub: uuid.UUID
    email: str
    display_name: str
    avatar_url: str | None


def _display_name(metadata: dict, email: str) -> str:
    for field in ("full_name", "name"):
        value = metadata.get(field)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return email.split("@")[0]


async def verify_token(token: str, cache=None) -> TokenClaims:
    """Verify a Supabase-issued JWT and return its claims.

    Raises InvalidTokenError on any verification failure, and
    JwksUnavailableError (from the cache) if signing keys cannot be obtained.
    """
    cache = cache if cache is not None else jwks_cache

    try:
        kid = jwt.get_unverified_header(token).get("kid")
    except jwt.PyJWTError as exc:
        logger.info("Rejected token with unreadable header: %s", exc)
        raise InvalidTokenError("Invalid token") from exc

    if not kid:
        logger.info("Rejected token with no kid header")
        raise InvalidTokenError("Invalid token")

    try:
        key = await cache.get_key(kid)
    except KeyError as exc:
        logger.info("Rejected token with unknown kid %s", kid)
        raise InvalidTokenError("Invalid token") from exc

    try:
        payload = jwt.decode(
            token,
            key.key,
            algorithms=ALLOWED_ALGORITHMS,
            audience=settings.jwt_audience,
            issuer=settings.jwt_issuer,
            leeway=60,
            options={"require": ["exp", "iss", "aud", "sub"]},
        )
    except jwt.PyJWTError as exc:
        logger.info("Rejected token: %s", exc)
        raise InvalidTokenError("Invalid token") from exc

    raw_sub = payload.get("sub")
    try:
        sub = uuid.UUID(str(raw_sub))
    except (ValueError, TypeError) as exc:
        logger.info("Rejected token with non-UUID sub")
        raise InvalidTokenError("Invalid token") from exc

    email = payload.get("email")
    if not isinstance(email, str) or not email.strip():
        logger.info("Rejected token with no email claim")
        raise InvalidTokenError("Invalid token")
    email = email.strip().lower()

    metadata = payload.get("user_metadata") or {}
    if not isinstance(metadata, dict):
        metadata = {}

    avatar = metadata.get("avatar_url")

    return TokenClaims(
        sub=sub,
        email=email,
        display_name=_display_name(metadata, email),
        avatar_url=avatar if isinstance(avatar, str) and avatar.strip() else None,
    )
