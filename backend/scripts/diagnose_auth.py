"""Say exactly why a real Supabase token is being refused.

The API returns one opaque body for every authentication failure, deliberately —
varying it would tell a caller which part of a forged token to fix next. That is
right for the API and useless when the *legitimate* case is failing, so this
does the same verification with the reason printed.

It signs up a throwaway account to get a genuine token, the same way the e2e
suite does, rather than asking anyone for theirs.

    ./.venv/Scripts/python.exe scripts/diagnose_auth.py
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import time
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

os.environ.setdefault("ENVIRONMENT", "development")

import logging

import httpx
import jwt

# The verifier logs its precise reason at INFO and the API deliberately does not
# repeat it in the response. Here we want it.
logging.basicConfig(level=logging.INFO, format="  [%(name)s] %(message)s")

from app.config import settings
from app.core.jwks import jwks_cache
from app.core.security import verify_token


def read_frontend_key() -> str | None:
    """The publishable/anon key the browser uses, from the frontend's env."""
    env = Path(__file__).resolve().parent.parent.parent / "frontend" / ".env.local"
    if not env.exists():
        return None

    for line in env.read_text(encoding="utf-8").splitlines():
        if line.startswith("NEXT_PUBLIC_SUPABASE_ANON_KEY="):
            return line.split("=", 1)[1].strip()
    return None


def show(label: str, value: object) -> None:
    print(f"  {label:<22} {value}")


async def main() -> None:
    base = settings.supabase_url.rstrip("/")
    key = read_frontend_key()

    print(f"\nProject      {base}")
    print(f"Expected iss {settings.jwt_issuer}")
    print(f"Browser key  {(key or '(missing)')[:24]}…  "
          f"({'new sb_ format' if key and key.startswith('sb_') else 'legacy JWT format'})")

    if not key:
        print("\nNo NEXT_PUBLIC_SUPABASE_ANON_KEY in frontend/.env.local — cannot get a token.")
        return

    # --- What the project publishes ---
    async with httpx.AsyncClient(timeout=30) as client:
        jwks = (await client.get(f"{base}/auth/v1/.well-known/jwks.json")).json()

    print(f"\nJWKS         {len(jwks.get('keys', []))} key(s)")
    for k in jwks.get("keys", []):
        show("", f"alg={k.get('alg')} kid={k.get('kid')}")

    # --- A genuine token, from a throwaway account ---
    email = f"e2e-authdiag-{uuid.uuid4().hex[:8]}@example.com"
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            f"{base}/auth/v1/signup",
            json={"email": email, "password": "diagnose-password-123"},
            headers={"apikey": key, "Content-Type": "application/json"},
        )

    if response.status_code >= 400:
        print(f"\nCould not sign up a throwaway account: {response.status_code}")
        print(f"  {response.text[:400]}")
        return

    token = response.json().get("access_token")
    if not token:
        print("\nSigned up, but Supabase returned no access_token.")
        print("  Email confirmation is probably on, which is a different problem:")
        print("  the account exists but cannot sign in until the link is clicked.")
        print(f"  {json.dumps(response.json())[:400]}")
        return

    header = jwt.get_unverified_header(token)
    claims = jwt.decode(token, options={"verify_signature": False})

    print("\nA real token from this project:")
    show("alg", header.get("alg"))
    show("kid", header.get("kid"))
    show("iss", claims.get("iss"))
    show("aud", claims.get("aud"))
    show("expires in", f"{int(claims.get('exp', 0) - time.time())}s")

    published = {k.get("kid") for k in jwks.get("keys", [])}
    if header.get("kid") not in published:
        print("\n  !! The token's kid is NOT in the published JWKS.")

    # --- What our verifier makes of it ---
    jwks_cache.clear()
    try:
        verified = await verify_token(token)
        print(f"\nverify_token: OK — {verified.email}")
        print("\nSo the backend accepts a fresh token. If the browser is still")
        print("getting 401s, its stored session predates a signing-key change:")
        print("signing out and back in replaces it.")
    except Exception as exc:  # noqa: BLE001 — a diagnostic reports whatever went wrong
        print(f"\nverify_token FAILED: {type(exc).__name__}: {exc}")


if __name__ == "__main__":
    asyncio.run(main())
