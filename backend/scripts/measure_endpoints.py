"""Time each endpoint the app hits.

Not a test — a measuring stick. Phase 11 established that a single
authenticated request costs a database round trip of roughly half a second
against a hosted Postgres in another region, and every page since has been
built on that assumption. This says whether it is still true, and which
endpoints have drifted.

Run against the app in-process rather than the dev server, for two reasons:
the dev server verifies tokens against real Supabase keys and will not accept a
minted one, and in-process removes HTTP overhead so what is left is the
database — which is where the time goes.

    ./.venv/Scripts/python.exe scripts/measure_endpoints.py
"""

from __future__ import annotations

import asyncio
import os
import statistics
import sys
import time
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

os.environ.setdefault("ENVIRONMENT", "development")

import httpx

from app.api.deps import forget_cached_users
from app.config import settings
from app.core import jwks as jwks_module
from app.main import app
from tests.keys import jwks_document, make_token


def install_test_keys() -> None:
    """Point the verifier at the suite's own keypair.

    The same thing conftest does with an autouse fixture. Verification runs the
    identical code path either way; only where the public key comes from
    differs, and reaching for real Supabase here would measure their network
    rather than ours.
    """

    # The issuer has to match the tokens as well as the keys: verification
    # checks both, and a token signed by the right key for the wrong issuer is
    # correctly refused.
    settings.supabase_url = "https://test.supabase.co"

    async def fetcher() -> dict:
        return jwks_document()

    jwks_module.jwks_cache._fetcher = fetcher
    jwks_module.jwks_cache.clear()

ROUNDS = 5


def auth(email: str) -> dict[str, str]:
    token = make_token(
        sub=str(uuid.uuid5(uuid.NAMESPACE_URL, f"folium-test:{email}")),
        email=email,
        issuer="https://test.supabase.co/auth/v1",
    )
    return {"Authorization": f"Bearer {token}"}


async def timed(client: httpx.AsyncClient, method: str, path: str, **kwargs):
    started = time.perf_counter()
    response = await client.request(method, path, **kwargs)
    return (time.perf_counter() - started) * 1000, response.status_code


async def main() -> None:
    install_test_keys()
    email = f"perf-{uuid.uuid4()}@example.com"
    headers = auth(email)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test", timeout=60) as client:
        # Warm: provision the user and make something to look at.
        await client.get("/api/v1/me", headers=headers)
        created = await client.post(
            "/api/v1/documents",
            json={"title": "Measurement", "content": {"type": "doc", "content": []}},
            headers=headers,
        )
        if created.status_code != 201:
            print(f"could not create a document: {created.status_code} {created.text[:300]}")
            return
        document_id = created.json()["id"]

        calls: list[tuple[str, str, dict]] = [
            ("GET", "/api/v1/me", {}),
            ("GET", "/api/v1/documents", {}),
            ("GET", "/api/v1/folders", {}),
            ("GET", "/api/v1/notifications/unread-count", {}),
            ("GET", f"/api/v1/documents/{document_id}", {}),
            ("GET", f"/api/v1/documents/{document_id}/comments", {}),
            ("GET", f"/api/v1/documents/{document_id}/shares", {}),
            ("GET", f"/api/v1/documents/{document_id}/attachments", {}),
            ("GET", f"/api/v1/documents/{document_id}/versions", {}),
            ("GET", f"/api/v1/documents/{document_id}/collab", {}),
            (
                "POST",
                "/api/v1/documents",
                {"json": {"title": "Timed", "content": {"type": "doc", "content": []}}},
            ),
        ]

        print(
            f"\nMedians over {ROUNDS} rounds, cold and warm interleaved.\n"
            "Cold clears the resolved-user cache first, so it pays the auth SELECT;\n"
            "warm is what every request after the first on a page actually costs.\n"
            "Interleaved because the network drifts between runs, which makes two\n"
            "separate runs incomparable — these two columns share their conditions."
        )
        print(f"\n{'endpoint':<48} {'cold':>9} {'warm':>9} {'saved':>9}  status")
        print("-" * 90)

        cold_total = 0.0
        warm_total = 0.0

        for method, path, kwargs in calls:
            cold_samples: list[float] = []
            warm_samples: list[float] = []
            status = 0

            for _ in range(ROUNDS):
                forget_cached_users()
                ms, status = await timed(client, method, path, headers=headers, **kwargs)
                cold_samples.append(ms)

                ms, status = await timed(client, method, path, headers=headers, **kwargs)
                warm_samples.append(ms)

            cold = statistics.median(cold_samples)
            warm = statistics.median(warm_samples)
            cold_total += cold
            warm_total += warm

            label = f"{method} {path.replace(document_id, '{id}')}"
            print(
                f"{label:<48} {cold:>8.0f}ms {warm:>8.0f}ms {cold - warm:>8.0f}ms  {status}"
            )

        print("-" * 90)
        print(
            f"{'sum of medians':<48} {cold_total:>8.0f}ms {warm_total:>8.0f}ms "
            f"{cold_total - warm_total:>8.0f}ms\n"
        )


if __name__ == "__main__":
    asyncio.run(main())
