"""The one place this service talks to Supabase Storage.

Deliberately a single narrow module, for the same reason `collab._mint` is one
function: it is the network boundary, so it is what tests replace. Nothing else
in the codebase knows that Storage is HTTP, or that a service-role key exists.

The key bypasses row-level security. Every permission decision is made before
anything here is called, in `app/services/attachments.py`, which resolves the
document through the same `documents.get_document` every other route uses.
"""

import logging

import httpx

from app.config import settings
from app.core.exceptions import FoliumError

logger = logging.getLogger(__name__)

BUCKET = "attachments"

# Storage is a network call from a free-tier host to a hosted service. Without a
# timeout a hung connection holds a worker until the client gives up — the
# ledger records exactly this hazard for y-sweet's create_doc, which has none.
TIMEOUT = httpx.Timeout(30.0, connect=10.0)

DOWNLOAD_URL_TTL_SECONDS = 300


class StorageUnavailableError(FoliumError):
    """Storage could not be reached, or refused the request.

    Infrastructure, not an access decision, so it maps to 503 — the line Phase
    2A drew for JWKS and Phase 4-i drew for y-sweet. A storage outage must never
    present as "you may not see this file", because that is indistinguishable
    from the permission system working.
    """


def _require_configuration() -> tuple[str, str]:
    """Return the storage base URL and key, or refuse to call out.

    Checked here rather than trusted from the caller: a blank key would
    otherwise become an Authorization header of "Bearer ", which Storage answers
    with a 400 that reads like a bug in the request rather than a deployment
    that has not configured attachments.
    """
    if not settings.attachments_enabled:
        raise StorageUnavailableError("Attachments are not configured")

    return settings.storage_url, settings.supabase_service_role_key.strip()


def _headers(key: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {key}", "apikey": key}


async def upload(path: str, data: bytes, content_type: str) -> None:
    """Store `data` at `path` in the attachments bucket.

    `content_type` is derived from the filename's extension by the caller, never
    taken from the uploader's request — a claimed type is a claim, and storing it
    unchecked means the bytes come back out under a type they are not.
    """
    base, key = _require_configuration()

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            response = await client.post(
                f"{base}/object/{BUCKET}/{path}",
                content=data,
                headers={**_headers(key), "Content-Type": content_type},
            )
    except httpx.HTTPError as exc:
        raise StorageUnavailableError("Could not reach storage") from exc

    if response.status_code >= 400:
        # The body can carry the key back in an error echo, so it is logged at
        # debug and never returned to the caller.
        logger.error("Storage upload failed: %s", response.status_code)
        raise StorageUnavailableError("Could not store the file")


async def signed_url(path: str, expires_in: int = DOWNLOAD_URL_TTL_SECONDS) -> str:
    """A short-lived URL the browser can fetch the file from directly.

    Downloads are not proxied back through FastAPI. Uploads are — they are
    bounded and need validating — but streaming every download out through a
    free-tier Python host is the one part of this that would genuinely hurt.
    """
    base, key = _require_configuration()

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            response = await client.post(
                f"{base}/object/sign/{BUCKET}/{path}",
                json={"expiresIn": expires_in},
                headers=_headers(key),
            )
    except httpx.HTTPError as exc:
        raise StorageUnavailableError("Could not reach storage") from exc

    if response.status_code >= 400:
        logger.error("Storage sign failed: %s", response.status_code)
        raise StorageUnavailableError("Could not prepare the download")

    signed = response.json().get("signedURL") or response.json().get("signedUrl")
    if not signed:
        raise StorageUnavailableError("Storage returned no URL")

    # Storage answers with a path relative to /storage/v1, not an absolute URL.
    return f"{base}{signed}" if signed.startswith("/") else f"{base}/{signed}"


async def remove(paths: list[str]) -> None:
    """Delete objects, tolerating ones that are already gone.

    Callers use this while deleting something else — a document, or an
    attachment row that is about to disappear. A missing object means the
    desired end state already holds, so treating it as an error would turn
    success into a failed request.
    """
    if not paths:
        return

    base, key = _require_configuration()

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            response = await client.request(
                "DELETE",
                f"{base}/object/{BUCKET}",
                json={"prefixes": paths},
                headers=_headers(key),
            )
    except httpx.HTTPError as exc:
        raise StorageUnavailableError("Could not reach storage") from exc

    if response.status_code == 404:
        return

    if response.status_code >= 400:
        logger.error("Storage delete failed: %s", response.status_code)
        raise StorageUnavailableError("Could not delete the file")
