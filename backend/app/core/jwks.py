"""Fetching and caching Supabase's public signing keys.

PyJWT ships a PyJWKClient, but it performs blocking network I/O, which would
stall the event loop inside an async request handler. This module does the same
job with httpx's async client.
"""

import asyncio
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

    def __init__(
        self,
        fetcher: JwksFetcher | None = None,
        ttl_seconds: int | None = None,
        max_stale_seconds: float = 3600.0,
    ):
        self._fetcher = fetcher or _fetch_from_supabase
        self._ttl = settings.jwks_cache_ttl_seconds if ttl_seconds is None else ttl_seconds
        self._max_stale_seconds = max_stale_seconds
        self._keys: dict[str, PyJWK] = {}
        self._fetched_at: float = 0.0
        self._lock = asyncio.Lock()

    def clear(self) -> None:
        self._keys = {}
        self._fetched_at = 0.0

    @property
    def _is_stale(self) -> bool:
        return (time.monotonic() - self._fetched_at) >= self._ttl

    @property
    def _is_beyond_max_stale(self) -> bool:
        return (time.monotonic() - self._fetched_at) >= self._max_stale_seconds

    async def _refresh(self) -> None:
        """Fetch and parse the JWKS document, replacing the cache on success.

        Not thread/task-safe on its own — this is only ever called with
        `self._lock` already held by `get_key`, which serialises refreshes.
        """
        try:
            document = await self._fetcher()
        except Exception as exc:
            if self._keys and not self._is_beyond_max_stale:
                # Usable keys are held within the staleness budget; a
                # transient outage must not sign everyone out.
                logger.warning("JWKS refresh failed, serving cached keys: %s", exc)
                return
            logger.error("JWKS fetch failed with an empty or too-stale cache: %s", exc)
            raise JwksUnavailableError("Signing keys are unavailable") from exc

        parsed_keys: dict[str, PyJWK] = {}
        for jwk in document.get("keys", []):
            kid = jwk.get("kid")
            if not kid:
                continue
            try:
                parsed_keys[kid] = PyJWK.from_dict(jwk)
            except Exception as exc:
                logger.warning("Skipping malformed JWKS entry for kid=%s: %s", kid, exc)
                continue

        if not parsed_keys:
            if self._keys and not self._is_beyond_max_stale:
                logger.warning(
                    "JWKS response contained no usable keys, serving cached keys"
                )
                return
            logger.error(
                "JWKS response contained no usable keys and no usable cache remains"
            )
            raise JwksUnavailableError("JWKS response contained no usable keys")

        self._keys = parsed_keys
        self._fetched_at = time.monotonic()

    async def get_key(self, kid: str) -> PyJWK:
        """Return the public key for `kid`, refreshing at most once if unknown.

        Raises KeyError if the key is still unknown after a refresh, and
        JwksUnavailableError if keys cannot be obtained at all.
        """
        async with self._lock:
            refreshed = False
            if not self._keys or self._is_stale:
                await self._refresh()
                refreshed = True

            if kid in self._keys:
                return self._keys[kid]

            # Unknown kid: keys may have rotated. Refresh at most once more, so
            # random key ids cannot drive unbounded outbound requests.
            if not refreshed:
                await self._refresh()

            if kid not in self._keys:
                raise KeyError(kid)
            return self._keys[kid]


jwks_cache = JwksCache()
