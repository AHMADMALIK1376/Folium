import asyncio
import time

import pytest

from app.config import settings
from app.core.exceptions import JwksUnavailableError
from app.core.jwks import JwksCache, _fetch_from_supabase
from tests.keys import TEST_KID, jwks_document


class FakeFetcher:
    """Stands in for the network. Records call count so caching is observable."""

    def __init__(self, document=None, fail=False):
        self.document = document if document is not None else jwks_document()
        self.fail = fail
        self.calls = 0

    async def __call__(self) -> dict:
        self.calls += 1
        if self.fail:
            raise RuntimeError("network down")
        return self.document


async def test_fetches_and_returns_the_key():
    fetcher = FakeFetcher()
    cache = JwksCache(fetcher=fetcher, ttl_seconds=600)
    key = await cache.get_key(TEST_KID)
    assert key is not None
    assert fetcher.calls == 1


async def test_second_lookup_is_served_from_cache():
    fetcher = FakeFetcher()
    cache = JwksCache(fetcher=fetcher, ttl_seconds=600)
    await cache.get_key(TEST_KID)
    await cache.get_key(TEST_KID)
    assert fetcher.calls == 1


async def test_unknown_kid_triggers_exactly_one_refetch_then_fails():
    fetcher = FakeFetcher()
    cache = JwksCache(fetcher=fetcher, ttl_seconds=600)
    await cache.get_key(TEST_KID)
    assert fetcher.calls == 1

    with pytest.raises(KeyError):
        await cache.get_key("rotated-key-id")

    # Exactly one extra fetch: bounded so random key ids cannot be used to
    # force unlimited outbound requests.
    assert fetcher.calls == 2


async def test_expired_cache_refetches():
    fetcher = FakeFetcher()
    cache = JwksCache(fetcher=fetcher, ttl_seconds=0)
    await cache.get_key(TEST_KID)
    time.sleep(0.01)
    await cache.get_key(TEST_KID)
    assert fetcher.calls == 2


async def test_fetch_failure_with_empty_cache_raises_unavailable():
    fetcher = FakeFetcher(fail=True)
    cache = JwksCache(fetcher=fetcher, ttl_seconds=600)
    with pytest.raises(JwksUnavailableError):
        await cache.get_key(TEST_KID)


async def test_fetch_failure_is_tolerated_while_cache_is_warm():
    fetcher = FakeFetcher()
    cache = JwksCache(fetcher=fetcher, ttl_seconds=0)
    await cache.get_key(TEST_KID)

    # A Supabase blip must not log everyone out while usable keys are held.
    fetcher.fail = True
    key = await cache.get_key(TEST_KID)
    assert key is not None


async def test_clear_empties_the_cache():
    fetcher = FakeFetcher()
    cache = JwksCache(fetcher=fetcher, ttl_seconds=600)
    await cache.get_key(TEST_KID)
    cache.clear()
    await cache.get_key(TEST_KID)
    assert fetcher.calls == 2


async def test_unconfigured_supabase_url_raises_unavailable(monkeypatch):
    monkeypatch.setattr(settings, "supabase_url", "")
    with pytest.raises(JwksUnavailableError):
        await _fetch_from_supabase()


async def test_malformed_jwk_entry_is_skipped_but_valid_keys_survive():
    document = jwks_document()
    document["keys"].insert(0, {"kid": "bad", "kty": "OCT"})
    fetcher = FakeFetcher(document=document)
    cache = JwksCache(fetcher=fetcher, ttl_seconds=600)

    key = await cache.get_key(TEST_KID)
    assert key is not None


async def test_document_with_no_usable_keys_raises_unavailable():
    fetcher = FakeFetcher(document={"keys": []})
    cache = JwksCache(fetcher=fetcher, ttl_seconds=600)
    with pytest.raises(JwksUnavailableError):
        await cache.get_key(TEST_KID)


async def test_document_missing_keys_field_raises_unavailable():
    fetcher = FakeFetcher(document={})
    cache = JwksCache(fetcher=fetcher, ttl_seconds=600)
    with pytest.raises(JwksUnavailableError):
        await cache.get_key(TEST_KID)


async def test_keys_older_than_max_stale_are_not_served():
    fetcher = FakeFetcher()
    cache = JwksCache(fetcher=fetcher, ttl_seconds=0, max_stale_seconds=0)
    await cache.get_key(TEST_KID)

    # The cache is warm but immediately beyond the staleness budget, and the
    # refresh fails: a request must not be served an arbitrarily old key.
    fetcher.fail = True
    with pytest.raises(JwksUnavailableError):
        await cache.get_key(TEST_KID)


async def test_concurrent_cold_lookups_trigger_one_fetch():
    class SlowFetcher(FakeFetcher):
        async def __call__(self) -> dict:
            self.calls += 1
            await asyncio.sleep(0.01)
            return self.document

    fetcher = SlowFetcher()
    cache = JwksCache(fetcher=fetcher, ttl_seconds=600)

    results = await asyncio.gather(*[cache.get_key(TEST_KID) for _ in range(10)])
    assert all(result is not None for result in results)
    assert fetcher.calls == 1


async def test_cold_cache_unknown_kid_fetches_exactly_once():
    fetcher = FakeFetcher()
    cache = JwksCache(fetcher=fetcher, ttl_seconds=600)

    with pytest.raises(KeyError):
        await cache.get_key("never-seen-kid")

    assert fetcher.calls == 1
