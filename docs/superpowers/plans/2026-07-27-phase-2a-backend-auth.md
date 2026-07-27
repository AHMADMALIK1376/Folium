# Folium Phase 2A — Backend Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the development-only `X-Dev-User-Email` authentication stand-in with real Supabase JWT verification, provisioning users on first authenticated request.

**Architecture:** A new `app/core/security.py` owns token verification; a new `app/core/jwks.py` owns fetching and caching Supabase's public keys. `get_current_user` in `app/api/deps.py` keeps its signature and return type, so all 12 routes and every service function stay untouched. Tests mint their own ES256 tokens against a locally generated keypair and a patched key source, exercising the identical production verification path with no network access.

**Tech Stack:** Python 3.12, FastAPI, PyJWT with the `crypto` extra, `cryptography`, httpx (async, already present), pytest.

## Global Constraints

- Python **3.12+**. Backend source under `backend/app/`; tests under `backend/tests/`.
- **`app/services/` must never import from `fastapi`.**
- **Unauthorized access returns 404, never 403** for documents and shares. Authentication failures return **401**.
- **Algorithms are pinned to an explicit allowlist: `["ES256", "RS256"]`.** Never read the algorithm from the token header. `HS*` and `none` must be rejected.
- **Every authentication failure returns an identical generic 401 body.** The specific reason is logged server-side only.
- **Never fail open.** If the JWKS endpoint is unreachable and the cache is empty, return **503** — never allow the request.
- Emails are stored **lowercased**.
- `users.id` is the Supabase `sub` claim. `iss` must equal `{SUPABASE_URL}/auth/v1`; `aud` must equal `authenticated`.
- JWKS cache TTL is **600 seconds**. An unknown `kid` triggers **exactly one** refetch.
- `SUPABASE_SERVICE_ROLE_KEY` must **not** be added — the backend only verifies tokens.
- No frontend work in this phase. No OAuth provider registration. No Row Level Security.

---

### Task 1: Configuration and dependency

**Files:**
- Modify: `backend/pyproject.toml`
- Modify: `backend/app/config.py`
- Modify: `backend/.env.example`
- Test: `backend/tests/test_config.py`

**Interfaces:**
- Consumes: nothing
- Produces: `settings.supabase_url: str`, `settings.jwks_url: str`, `settings.jwt_issuer: str`, `settings.jwt_audience: str`, `settings.jwks_cache_ttl_seconds: int`

- [ ] **Step 1: Add the JWT dependency to `backend/pyproject.toml`**

In the `dependencies` list, add this line after `"pydantic[email]>=2.9",`:

```toml
    "pyjwt[crypto]>=2.9",
```

The `[crypto]` extra pulls in `cryptography`, which is required for ES256. Plain `pyjwt` only supports HMAC and would silently make asymmetric verification impossible.

- [ ] **Step 2: Install it**

```bash
cd D:/AJAIA/Folium/backend && .venv/Scripts/python -m pip install -e ".[dev]"
```

Expected: installs `pyjwt` and `cryptography` without error.

- [ ] **Step 3: Write the failing test in `backend/tests/test_config.py`**

```python
from app.config import Settings


def test_supabase_urls_are_derived_from_project_url():
    s = Settings(_env_file=None, supabase_url="https://abc.supabase.co")
    assert s.jwks_url == "https://abc.supabase.co/auth/v1/.well-known/jwks.json"
    assert s.jwt_issuer == "https://abc.supabase.co/auth/v1"


def test_trailing_slash_on_project_url_is_normalised():
    s = Settings(_env_file=None, supabase_url="https://abc.supabase.co/")
    assert s.jwks_url == "https://abc.supabase.co/auth/v1/.well-known/jwks.json"
    assert s.jwt_issuer == "https://abc.supabase.co/auth/v1"


def test_audience_and_ttl_defaults():
    s = Settings(_env_file=None, supabase_url="https://abc.supabase.co")
    assert s.jwt_audience == "authenticated"
    assert s.jwks_cache_ttl_seconds == 600


def test_environment_still_defaults_to_production():
    assert Settings(_env_file=None).environment == "production"
```

- [ ] **Step 4: Run it to verify it fails**

```bash
cd D:/AJAIA/Folium/backend && .venv/Scripts/python -m pytest tests/test_config.py -v
```

Expected: FAIL with `AttributeError: 'Settings' object has no attribute 'jwks_url'`.

- [ ] **Step 5: Replace `backend/app/config.py` entirely**

```python
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://folium:folium@localhost:5433/folium"
    # Must stay "production" so an unset ENVIRONMENT fails closed. This no longer
    # gates authentication, but it does gate exposure of the interactive API docs.
    environment: str = "production"
    frontend_origin: str = "http://localhost:3000"

    # Supabase project URL, e.g. https://abc.supabase.co. The issuer and JWKS
    # URL are derived from it rather than configured separately so they cannot
    # drift apart. Deliberately no SUPABASE_SERVICE_ROLE_KEY: this service only
    # verifies tokens and never calls Supabase's admin API.
    supabase_url: str = ""

    jwks_cache_ttl_seconds: int = 600

    @property
    def is_development(self) -> bool:
        return self.environment == "development"

    @property
    def _supabase_base(self) -> str:
        return self.supabase_url.rstrip("/")

    @property
    def jwt_issuer(self) -> str:
        return f"{self._supabase_base}/auth/v1"

    @property
    def jwks_url(self) -> str:
        return f"{self._supabase_base}/auth/v1/.well-known/jwks.json"

    @property
    def jwt_audience(self) -> str:
        return "authenticated"


settings = Settings()
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
cd D:/AJAIA/Folium/backend && .venv/Scripts/python -m pytest tests/test_config.py -v
```

Expected: 4 tests PASS.

- [ ] **Step 7: Add the variable to `backend/.env.example`**

Replace the file's contents with:

```bash
DATABASE_URL=postgresql+asyncpg://folium:folium@localhost:5433/folium
ENVIRONMENT=development
FRONTEND_ORIGIN=http://localhost:3000
SUPABASE_URL=https://your-project-ref.supabase.co
```

- [ ] **Step 8: Run the full suite and commit**

```bash
cd D:/AJAIA/Folium/backend && .venv/Scripts/python -m pytest -q
```

Expected: all existing tests still pass, plus the 4 new ones.

```bash
cd D:/AJAIA/Folium
git add backend/
git commit -m "feat(backend): add Supabase URL config and PyJWT dependency"
```

---

### Task 2: Route existing tests through one auth helper

**Files:**
- Modify: `backend/tests/conftest.py`
- Modify: `backend/tests/test_documents_api.py`
- Modify: `backend/tests/test_shares_api.py`
- Modify: `backend/tests/test_upload_api.py`

**Interfaces:**
- Consumes: nothing
- Produces: `auth_headers(email: str) -> dict[str, str]` importable from `tests.conftest`. Task 6 changes its body from the dev header to a real JWT; nothing else has to change.

This is a **pure refactor with no behaviour change**. Four test files currently build the dev-auth header themselves. Funnelling them through one helper now means Task 6 can swap the entire suite to real JWTs by editing a single function, instead of a sprawling change that mixes refactor with behaviour and leaves the suite red in between.

- [ ] **Step 1: Add the helper to `backend/tests/conftest.py`**

Insert immediately after the `from app.main import app` line:

```python
def auth_headers(email: str) -> dict[str, str]:
    """Return request headers authenticating as `email`.

    Single source of truth for test authentication. Task 6 swaps the body of
    this function for a real signed JWT; no test file changes.
    """
    return {"X-Dev-User-Email": email}
```

- [ ] **Step 2: Update `backend/tests/test_documents_api.py`**

Add to the imports at the top of the file:

```python
from tests.conftest import auth_headers
```

Then delete the local `headers` function:

```python
def headers(email: str) -> dict[str, str]:
    return {"X-Dev-User-Email": email}
```

and replace both fixtures with:

```python
@pytest.fixture
def alice() -> dict[str, str]:
    return auth_headers(f"alice-{uuid.uuid4()}@example.com")


@pytest.fixture
def bob() -> dict[str, str]:
    return auth_headers(f"bob-{uuid.uuid4()}@example.com")
```

- [ ] **Step 3: Update `backend/tests/test_shares_api.py`**

Add to the imports:

```python
from tests.conftest import auth_headers
```

Delete the local helper:

```python
def headers(email: str) -> dict[str, str]:
    return {"X-Dev-User-Email": email}
```

Then replace every remaining call to `headers(` in that file with `auth_headers(`. There are calls inside `make_doc`, `ensure_user`, and each test body — change all of them.

- [ ] **Step 4: Update `backend/tests/test_upload_api.py`**

Add to the imports:

```python
from tests.conftest import auth_headers
```

Replace the `alice` fixture with:

```python
@pytest.fixture
def alice() -> dict[str, str]:
    return auth_headers(f"alice-{uuid.uuid4()}@example.com")
```

- [ ] **Step 5: Leave `backend/tests/test_auth_seam.py` alone**

It tests the dev seam directly and is deleted wholesale in Task 6. Touching it now is wasted work.

- [ ] **Step 6: Confirm no test file builds the header itself any more**

```bash
cd D:/AJAIA/Folium/backend && grep -rn "X-Dev-User-Email" tests/ --include=*.py
```

Expected: matches **only** in `tests/conftest.py` and `tests/test_auth_seam.py`.

- [ ] **Step 7: Run the full suite — it must be unchanged**

```bash
cd D:/AJAIA/Folium/backend && .venv/Scripts/python -m pytest -q
```

Expected: the same number of tests pass as before this task. A pure refactor that changes the count means something was dropped.

- [ ] **Step 8: Commit**

```bash
cd D:/AJAIA/Folium
git add backend/tests/
git commit -m "test(backend): funnel test auth through a single auth_headers helper"
```

---

### Task 3: Test key harness

**Files:**
- Create: `backend/tests/keys.py`
- Test: `backend/tests/test_keys_harness.py`

**Interfaces:**
- Consumes: nothing
- Produces: `TEST_KID: str`, `private_key` (an `ec.EllipticCurvePrivateKey`), `jwks_document() -> dict`, `make_token(sub=None, email=..., issuer=None, audience=None, algorithm="ES256", key=None, headers=None, **claims) -> str`, `other_private_key` (a second, unrelated keypair for negative tests).

Tests must mint their own tokens so the suite never touches the network. This module is the only place that knows how.

- [ ] **Step 1: Write the failing test in `backend/tests/test_keys_harness.py`**

```python
import jwt

from tests.keys import TEST_KID, jwks_document, make_token, private_key


def test_jwks_document_shape():
    doc = jwks_document()
    assert list(doc.keys()) == ["keys"]
    key = doc["keys"][0]
    assert key["kid"] == TEST_KID
    assert key["alg"] == "ES256"
    assert key["kty"] == "EC"
    assert key["crv"] == "P-256"
    assert key["use"] == "sig"


def test_make_token_is_verifiable_with_the_public_key():
    token = make_token(email="a@example.com", issuer="https://x/auth/v1", audience="authenticated")
    decoded = jwt.decode(
        token,
        private_key.public_key(),
        algorithms=["ES256"],
        audience="authenticated",
        issuer="https://x/auth/v1",
    )
    assert decoded["email"] == "a@example.com"
    assert decoded["sub"]


def test_make_token_sets_the_kid_header():
    token = make_token(issuer="https://x/auth/v1")
    assert jwt.get_unverified_header(token)["kid"] == TEST_KID


def test_extra_claims_are_merged():
    token = make_token(issuer="https://x/auth/v1", user_metadata={"full_name": "Ada"})
    decoded = jwt.decode(token, private_key.public_key(), algorithms=["ES256"], audience="authenticated", issuer="https://x/auth/v1")
    assert decoded["user_metadata"] == {"full_name": "Ada"}
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd D:/AJAIA/Folium/backend && .venv/Scripts/python -m pytest tests/test_keys_harness.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'tests.keys'`.

- [ ] **Step 3: Create `backend/tests/keys.py`**

```python
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
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd D:/AJAIA/Folium/backend && .venv/Scripts/python -m pytest tests/test_keys_harness.py -v
```

Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd D:/AJAIA/Folium
git add backend/tests/
git commit -m "test(backend): add local ES256 key harness for minting test tokens"
```

---

### Task 4: JWKS client with caching

**Files:**
- Create: `backend/app/core/jwks.py`
- Modify: `backend/app/core/exceptions.py`
- Test: `backend/tests/test_jwks.py`

**Interfaces:**
- Consumes: `settings.jwks_url`, `settings.jwks_cache_ttl_seconds`
- Produces: `JwksCache` class with `async get_key(kid: str) -> PyJWK` and `clear() -> None`; module-level singleton `jwks_cache`; exception `JwksUnavailableError` in `app/core/exceptions.py`.

- [ ] **Step 1: Add the exception to `backend/app/core/exceptions.py`**

Append to the file:

```python
class JwksUnavailableError(FoliumError):
    """Supabase's signing keys could not be fetched and nothing is cached.

    This is an infrastructure failure, not an authentication decision, so it
    maps to 503. It must NEVER be downgraded into allowing the request: doing
    so would let an attacker bypass authentication by making the key endpoint
    unreachable.
    """
```

No second exception is added for user-provisioning failures: the existing
`ConflictError` already maps to 409 and fits exactly.

- [ ] **Step 2: Write the failing tests in `backend/tests/test_jwks.py`**

```python
import time

import pytest

from app.core.exceptions import JwksUnavailableError
from app.core.jwks import JwksCache
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
```

- [ ] **Step 3: Run them to verify they fail**

```bash
cd D:/AJAIA/Folium/backend && .venv/Scripts/python -m pytest tests/test_jwks.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'app.core.jwks'`.

- [ ] **Step 4: Create `backend/app/core/jwks.py`**

```python
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
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd D:/AJAIA/Folium/backend && .venv/Scripts/python -m pytest tests/test_jwks.py -v
```

Expected: 7 tests PASS.

- [ ] **Step 6: Commit**

```bash
cd D:/AJAIA/Folium
git add backend/
git commit -m "feat(backend): add async JWKS client that caches keys and fails closed"
```

---

### Task 5: Token verification

**Files:**
- Create: `backend/app/core/security.py`
- Test: `backend/tests/test_security.py`

**Interfaces:**
- Consumes: `jwks_cache`, `settings.jwt_issuer`, `settings.jwt_audience`, `JwksUnavailableError`
- Produces: `ALLOWED_ALGORITHMS: list[str]`, `TokenClaims` dataclass with fields `sub: uuid.UUID`, `email: str`, `display_name: str`, `avatar_url: str | None`, and `async verify_token(token: str, cache=None) -> TokenClaims` raising `InvalidTokenError` (defined in this module) on any failure.

- [ ] **Step 1: Write the failing tests in `backend/tests/test_security.py`**

```python
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

    The public key is public by definition. If the verifier accepted HMAC
    algorithms, an attacker could sign a forged token using that public key as
    the shared secret and be accepted as any user. Pinning the algorithm list
    is what closes this.

    Hand-forged with raw HMAC rather than jwt.encode: PyJWT refuses to sign
    HS256 with a PEM key. An attacker is under no such constraint, so the
    guard has to live in our verifier, not in the library building the token.
    """
    import base64
    import hashlib
    import hmac
    import json
    import time

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
```

- [ ] **Step 2: Run them to verify they fail**

```bash
cd D:/AJAIA/Folium/backend && .venv/Scripts/python -m pytest tests/test_security.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'app.core.security'`.

- [ ] **Step 3: Create `backend/app/core/security.py`**

```python
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
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd D:/AJAIA/Folium/backend && .venv/Scripts/python -m pytest tests/test_security.py -v
```

Expected: 18 tests PASS. If `test_hs256_token_signed_with_the_public_key_is_rejected` fails, stop — the algorithm allowlist is not being applied and the system is exploitable.

- [ ] **Step 5: Commit**

```bash
cd D:/AJAIA/Folium
git add backend/
git commit -m "feat(backend): verify Supabase JWTs with a pinned algorithm allowlist"
```

---

### Task 6: Swap the dependency and provision users

**Files:**
- Modify: `backend/app/api/deps.py`
- Modify: `backend/app/main.py`
- Modify: `backend/tests/conftest.py`
- Delete: `backend/tests/test_auth_seam.py`
- Test: `backend/tests/test_auth_jwt.py`

**Interfaces:**
- Consumes: `verify_token`, `TokenClaims`, `InvalidTokenError`, `JwksUnavailableError`, `auth_headers`
- Produces: `get_current_user` (unchanged signature: returns `User`), `CurrentUser`, `DbSession`

This is the task where behaviour changes. The dev header disappears entirely.

- [ ] **Step 1: Write the failing tests in `backend/tests/test_auth_jwt.py`**

```python
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
    token = make_token(issuer=ISSUER, user_metadata={"full_name": "Ada Lovelace"})
    response = await client.get("/api/v1/me", headers=bearer(token))
    assert response.json()["display_name"] == "Ada Lovelace"


async def test_same_sub_reuses_the_same_user(client: AsyncClient):
    sub = str(uuid.uuid4())
    first = await client.get("/api/v1/me", headers=bearer(make_token(sub=sub, issuer=ISSUER)))
    second = await client.get("/api/v1/me", headers=bearer(make_token(sub=sub, issuer=ISSUER)))
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
    token = make_token(issuer=ISSUER)
    assert (await client.get("/api/v1/documents", headers=bearer(token))).status_code == 200
```

- [ ] **Step 2: Run them to verify they fail**

```bash
cd D:/AJAIA/Folium/backend && .venv/Scripts/python -m pytest tests/test_auth_jwt.py -v
```

Expected: FAIL — the dev header still authenticates and bearer tokens are ignored.

- [ ] **Step 3: Replace `backend/app/api/deps.py` entirely**

```python
import logging
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError
from app.core.security import TokenClaims, InvalidTokenError, verify_token
from app.db.session import get_db
from app.models import User

logger = logging.getLogger(__name__)

DbSession = Annotated[AsyncSession, Depends(get_db)]

# One body for every authentication failure. Varying it would tell a caller
# which part of a forged token to fix next.
_UNAUTHENTICATED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Not authenticated",
    headers={"WWW-Authenticate": "Bearer"},
)


def _bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise _UNAUTHENTICATED
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise _UNAUTHENTICATED
    return token.strip()


async def _provision_user(db: AsyncSession, claims: TokenClaims) -> User:
    """Return the User for these claims, creating it on first sight.

    Uses an insert that tolerates conflict rather than check-then-insert, so
    two concurrent first requests from the same new user cannot race into a
    duplicate-key error.
    """
    stmt = (
        pg_insert(User)
        .values(
            id=claims.sub,
            email=claims.email,
            display_name=claims.display_name,
            avatar_url=claims.avatar_url,
        )
        .on_conflict_do_nothing(index_elements=[User.id])
    )

    try:
        await db.execute(stmt)
        await db.commit()
    except IntegrityError as exc:
        # The id conflict is absorbed above, so reaching here means the email
        # is already held by a DIFFERENT user id. Supabase enforces unique
        # emails, so this indicates stale rows or real corruption. Fail loudly
        # rather than reassigning someone else's documents to this caller.
        await db.rollback()
        logger.error("Email %s is already bound to a different user id", claims.email)
        raise ConflictError("Could not provision user") from exc

    result = await db.execute(select(User).where(User.id == claims.sub))
    user = result.scalar_one()

    # Keep the row in step with Supabase without a separate sync job.
    if user.email != claims.email or user.display_name != claims.display_name:
        user.email = claims.email
        user.display_name = claims.display_name
        user.avatar_url = claims.avatar_url
        try:
            await db.commit()
        except IntegrityError as exc:
            await db.rollback()
            logger.error("Cannot update user %s to email %s: already taken", user.id, claims.email)
            raise ConflictError("Could not update user") from exc
        await db.refresh(user)

    return user


async def get_current_user(
    db: DbSession,
    authorization: Annotated[str | None, Header()] = None,
) -> User:
    """Resolve the calling user from a Supabase-issued JWT.

    Raises 401 for any authentication failure. A JwksUnavailableError from the
    key cache is deliberately NOT caught here: it propagates to a 503 handler,
    because an unreachable key endpoint is an infrastructure fault and must
    never be downgraded into allowing the request.
    """
    token = _bearer_token(authorization)

    try:
        claims = await verify_token(token)
    except InvalidTokenError:
        raise _UNAUTHENTICATED from None

    return await _provision_user(db, claims)


CurrentUser = Annotated[User, Depends(get_current_user)]
```

- [ ] **Step 4: Register the 503 handler in `backend/app/main.py`**

Add `JwksUnavailableError` to the existing import from `app.core.exceptions`, then add this handler immediately before the generic `Exception` handler:

```python
@app.exception_handler(JwksUnavailableError)
async def handle_jwks_unavailable(request: Request, exc: JwksUnavailableError) -> JSONResponse:
    return JSONResponse(
        status_code=503,
        content={"detail": "Authentication is temporarily unavailable"},
    )
```

Registering it before the catch-all matters: FastAPI would otherwise let the generic handler turn this into a 500, hiding an infrastructure fault as an application bug.

- [ ] **Step 5: Point the test harness at real tokens in `backend/tests/conftest.py`**

Replace the `auth_headers` function with:

```python
def auth_headers(email: str, sub: str | None = None, **claims) -> dict[str, str]:
    """Return headers authenticating as `email` with a real signed JWT.

    Deterministic sub per email so repeated calls in one test resolve to the
    same user.
    """
    from tests.keys import make_token

    resolved = sub or str(uuid.uuid5(uuid.NAMESPACE_URL, f"folium-test:{email}"))
    token = make_token(
        sub=resolved,
        email=email,
        issuer="https://test.supabase.co/auth/v1",
        **claims,
    )
    return {"Authorization": f"Bearer {token}"}
```

Add `import uuid` to the top of the file, and add this autouse fixture so the app's issuer matches the tokens and the key cache serves the test keypair:

```python
@pytest.fixture(autouse=True)
def _test_auth(monkeypatch):
    from app.config import settings
    from app.core import jwks as jwks_module
    from tests.keys import jwks_document

    monkeypatch.setattr(settings, "supabase_url", "https://test.supabase.co")

    async def fetcher():
        return jwks_document()

    jwks_module.jwks_cache._fetcher = fetcher
    jwks_module.jwks_cache.clear()
    yield
    jwks_module.jwks_cache.clear()
```

- [ ] **Step 6: Delete the obsolete seam test**

```bash
cd D:/AJAIA/Folium && rm backend/tests/test_auth_seam.py
```

It tested the dev header and the fail-closed environment gate. Both are gone; `test_auth_jwt.py` covers the replacement, including `test_dev_header_no_longer_authenticates`.

- [ ] **Step 7: Run the new tests**

```bash
cd D:/AJAIA/Folium/backend && .venv/Scripts/python -m pytest tests/test_auth_jwt.py -v
```

Expected: 14 tests PASS.

- [ ] **Step 8: Clear orphaned development users**

Rows created by the dev header carry random UUIDs matching no Supabase user. They are not merely
useless: their emails occupy the unique index, so a real signup with the same address would collide
and 409. Clear them from the local database:

```bash
docker exec folium-db-1 psql -U folium -d folium -c "TRUNCATE users CASCADE;"
```

`CASCADE` also removes their documents and shares, which are equally orphaned. This is safe here
because no production data exists — do not run it against a database that has real users.

- [ ] **Step 9: Run the whole suite — every pre-existing test must still pass**

```bash
cd D:/AJAIA/Folium/backend && .venv/Scripts/python -m pytest -q
```

Expected: all pass. The document, share, and upload tests authenticate through `auth_headers`, which now mints real JWTs, so they exercise the production path end to end. If they fail, fix `auth_headers` or the dependency — do not weaken a test.

- [ ] **Step 10: Confirm the dev header is gone from the codebase**

```bash
cd D:/AJAIA/Folium/backend && grep -rn "X-Dev-User-Email\|x_dev_user_email" app/ tests/ --include=*.py
```

Expected: exactly one match — the assertion inside `test_dev_header_no_longer_authenticates`.

- [ ] **Step 11: Commit**

```bash
cd D:/AJAIA/Folium
git add -A backend/
git commit -m "feat(backend): replace dev header with Supabase JWT authentication"
```

---

### Task 7: Hide API docs in production, then update documentation

**Files:**
- Modify: `backend/app/main.py`
- Modify: `README.md`
- Modify: `DEPLOY.md`
- Test: `backend/tests/test_docs_exposure.py`

**Interfaces:**
- Consumes: `settings.is_development`
- Produces: nothing consumed by later tasks

`ENVIRONMENT` no longer gates authentication, but it should still gate one thing: whether the
interactive OpenAPI docs are published. Every endpoint, parameter, and schema is listed there, which
is a free map for anyone probing the service. Useful in development, unnecessary exposure in
production.

- [ ] **Step 1: Write the failing test in `backend/tests/test_docs_exposure.py`**

```python
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
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd D:/AJAIA/Folium/backend && .venv/Scripts/python -m pytest tests/test_docs_exposure.py -v
```

Expected: FAIL — the production cases return 200 because docs are always exposed.

- [ ] **Step 3: Gate the docs URLs in `backend/app/main.py`**

Replace the `app = FastAPI(...)` line with:

```python
# Publishing the full API surface is useful locally and needless exposure in
# production, where it hands anyone probing the service a complete map.
_docs_enabled = settings.is_development

app = FastAPI(
    title="Folium API",
    version="1.0.0",
    docs_url="/docs" if _docs_enabled else None,
    redoc_url="/redoc" if _docs_enabled else None,
    openapi_url="/openapi.json" if _docs_enabled else None,
)
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd D:/AJAIA/Folium/backend && .venv/Scripts/python -m pytest tests/test_docs_exposure.py -v
```

Expected: 3 tests PASS.

- [ ] **Step 5: Run the whole suite**

```bash
cd D:/AJAIA/Folium/backend && .venv/Scripts/python -m pytest -q
```

Expected: all pass. `tests/conftest.py` sets `ENVIRONMENT=development`, so docs stay available to any
other test that touches them.

- [ ] **Step 6: Confirm CI needs no Supabase credentials**

```bash
cd D:/AJAIA/Folium/backend && .venv/Scripts/python -m pytest -q
```

Tests patch the key fetcher and mint their own tokens, so no `SUPABASE_URL` is required. Confirm `.github/workflows/backend.yml` sets no Supabase variables — if the suite passes locally without them, CI needs none either. Make no change to the workflow unless this check fails.

- [ ] **Step 7: Update the README status banner**

In `README.md`, replace this sentence in the status block:

```
> is still a development-only stand-in (an email header, no passwords or sessions) — real auth,
> real-time collaboration, and version history remain upcoming phases. See
```

with:

```
> uses real Supabase JWT verification (Phase 2A) — the frontend still runs the old v1 code and is
> not yet connected to the backend. Frontend auth pages, the design system, and the FastAPI
> cut-over remain upcoming phases. See
```

- [ ] **Step 8: Update the README development section**

In `README.md`, immediately after the "Run the backend:" code block, add:

````markdown
The backend requires `SUPABASE_URL` to verify tokens. Copy `backend/.env.example` to `backend/.env`
and set it to your project URL:

```bash
SUPABASE_URL=https://your-project-ref.supabase.co
```

Requests must carry a Supabase-issued JWT as `Authorization: Bearer <token>`. There is no
development bypass — the tests mint their own signed tokens instead.
````

- [ ] **Step 9: Update `DEPLOY.md`**

In Part 1, section "2. Backend (Render)", replace the environment variables block with:

```
DATABASE_URL=<Supabase connection string>
SUPABASE_URL=<project URL>
FRONTEND_ORIGIN=<your Vercel URL>
ENVIRONMENT=production
```

Then add this paragraph directly beneath it:

```markdown
`SUPABASE_SERVICE_ROLE_KEY` is deliberately absent. The backend only verifies tokens against
Supabase's public keys and never calls the admin API, so it has no need for a credential that could
mint tokens or bypass access control. Do not add it.
```

- [ ] **Step 10: Verify no stale references remain**

```bash
cd D:/AJAIA/Folium && grep -rn "X-Dev-User-Email" README.md DEPLOY.md ARCHITECTURE.md
```

Expected: no matches.

- [ ] **Step 11: Commit**

```bash
cd D:/AJAIA/Folium
git add -A backend/ README.md DEPLOY.md
git commit -m "feat(backend): hide API docs in production; document JWT auth"
```

---

## Definition of done

- [ ] `X-Dev-User-Email` appears nowhere except the test asserting it no longer works
- [ ] Every `/api/v1` route requires a valid Supabase-issued JWT
- [ ] An `HS256` token signed with the public key is rejected (algorithm confusion closed)
- [ ] An `alg: none` token is rejected
- [ ] Unreachable JWKS with an empty cache yields 503, never 200
- [ ] A warm cache tolerates a JWKS outage without signing users out
- [ ] A new `sub` provisions a user row; a repeat `sub` reuses it
- [ ] Every authentication failure returns an identical response body
- [ ] An email already bound to a different user id yields 409, never a silent reassignment
- [ ] Interactive API docs are served in development and return 404 in production
- [ ] Orphaned development user rows are cleared
- [ ] The full backend suite passes with no network access and no Supabase credentials
- [ ] No frontend files changed
