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

# Must not exceed the column widths in app/models/user.py. user_metadata is
# user-writable through Supabase's client, so an over-long value would other-
# wise raise a database truncation error on every request from that account.
MAX_EMAIL_LENGTH = 320
MAX_DISPLAY_NAME_LENGTH = 200
MAX_AVATAR_URL_LENGTH = 1000


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
        # Pass the PyJWK itself, not key.key. A raw cryptography key lets
        # PyJWT pick the algorithm from the attacker-controlled header (only
        # constrained to ALLOWED_ALGORITHMS), so a token claiming alg=RS256
        # against our real EC key reaches RSAAlgorithm.prepare_key and raises
        # a bare TypeError instead of a PyJWTError. Passing the PyJWK binds
        # verification to the key's own algorithm, so a mismatched header
        # raises InvalidAlgorithmError (a PyJWTError) and is caught below.
        payload = jwt.decode(
            token,
            key,
            algorithms=ALLOWED_ALGORITHMS,
            audience=settings.jwt_audience,
            issuer=settings.jwt_issuer,
            leeway=60,
            options={
                "require": ["exp", "iss", "aud", "sub"],
                # `iat` is NOT verified, and that is deliberate.
                #
                # PyJWT rejects a token whose issued-at is in the future, which
                # sounds prudent and is really a clock check wearing a security
                # check's clothes. It cost a whole afternoon: a machine three
                # hours behind Supabase refused every token that project issued
                # — every request, every user, one opaque 401, and nothing on
                # screen suggesting the clock.
                #
                # There is nothing to lose by dropping it. `iat` is
                # informational in RFC 7519; what bounds a token's life is
                # `exp`, which is still required and still verified, and what
                # proves it genuine is the signature. No policy here asks how
                # old a token is. So verifying `iat` can only ever produce a
                # false negative, and it produces a catastrophic one.
                #
                # A skewed clock is still worth fixing — `exp` is checked
                # against the same wrong `now`, so a machine behind by an hour
                # accepts tokens for an hour after they expire. That is the
                # clock's problem to fix, not a reason to also refuse valid
                # tokens.
                "verify_iat": False,
            },
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
    if len(email) > MAX_EMAIL_LENGTH:
        logger.info("Rejected token with implausibly long email (%d chars)", len(email))
        raise InvalidTokenError("Invalid token")

    metadata = payload.get("user_metadata") or {}
    if not isinstance(metadata, dict):
        metadata = {}

    avatar = metadata.get("avatar_url")
    avatar_url = avatar if isinstance(avatar, str) and avatar.strip() else None
    if avatar_url is not None and len(avatar_url) > MAX_AVATAR_URL_LENGTH:
        # Drop rather than reject: a bad avatar must not lock a user out.
        avatar_url = None

    display_name = _display_name(metadata, email)[:MAX_DISPLAY_NAME_LENGTH]

    return TokenClaims(
        sub=sub,
        email=email,
        display_name=display_name,
        avatar_url=avatar_url,
    )
