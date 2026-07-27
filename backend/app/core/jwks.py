"""Fetching and caching Supabase's public signing keys.

PyJWT ships a PyJWKClient, but it performs blocking network I/O, which would
stall the event loop inside an async request handler. This module does the same
job with httpx's async client.
"""

import logging
import time
from collections.abc import Awaitable, Callable
from typing import Any

import httpx
from jwt import PyJWK

from app.config import settings
from app.core.exceptions import JwksUnavailableError

logger = logging.getLogger(__name__)

JwksFetcher = Callable[[], Awaitable[dict[str, Any]]]


async def _fetch_from_supabase() -> dict[str, Any]:
    if not settings.supabase_url:
        raise JwksUnavailableError("SUPABASE_URL is not configured")
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(settings.jwks_url)
        response.raise_for_status()
        return response.json()


class JwksCache:
    """Caches public keys by key id, refreshing on a TTL.

    Fails closed: when no usable key is held and the fetch fails, it raises
    rather than letting a request proceed unverified.
    """

    def __init__(self, fetcher: JwksFetcher | None = None, ttl_seconds: int | None = None):
        self._fetcher = fetcher or _fetch_from_supabase
        self._ttl = settings.jwks_cache_ttl_seconds if ttl_seconds is None else ttl_seconds
        self._keys: dict[str, PyJWK] = {}
        self._fetched_at: float = 0.0

    def clear(self) -> None:
        self._keys = {}
        self._fetched_at = 0.0

    @property
    def _is_stale(self) -> bool:
        return (time.monotonic() - self._fetched_at) >= self._ttl

    async def _refresh(self) -> None:
        try:
            document = await self._fetcher()
        except Exception as exc:
            if self._keys:
                # Usable keys are held; a transient outage must not sign
                # everyone out.
                logger.warning("JWKS refresh failed, serving cached keys: %s", exc)
                return
            logger.error("JWKS fetch failed with an empty cache: %s", exc)
            raise JwksUnavailableError("Signing keys are unavailable") from exc

        self._keys = {
            jwk["kid"]: PyJWK.from_dict(jwk)
            for jwk in document.get("keys", [])
            if "kid" in jwk
        }
        self._fetched_at = time.monotonic()

    async def get_key(self, kid: str) -> PyJWK:
        """Return the public key for `kid`, refreshing at most once if unknown.

        Raises KeyError if the key is still unknown after a refresh, and
        JwksUnavailableError if keys cannot be obtained at all.
        """
        if not self._keys or self._is_stale:
            await self._refresh()

        if kid in self._keys:
            return self._keys[kid]

        # Unknown kid: keys may have rotated. Refresh once — and only once, so
        # random key ids cannot drive unbounded outbound requests.
        await self._refresh()

        if kid not in self._keys:
            raise KeyError(kid)
        return self._keys[kid]


jwks_cache = JwksCache()
