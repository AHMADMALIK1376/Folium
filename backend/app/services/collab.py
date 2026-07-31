import asyncio
from uuid import UUID

from app.config import settings
from app.core.exceptions import FoliumError


class CollabUnavailableError(FoliumError):
    """The collaboration server could not be reached.

    Infrastructure, not authentication — it maps to 503. Phase 2A drew this line
    for the JWKS endpoint and it holds for the same reason: an outage must never
    read as every user's credentials failing at once.
    """


def room_id(document_id: UUID) -> str:
    """The y-sweet room for a document.

    Derived here rather than accepted from the request, and that is the whole
    point: a client that could name its own room could join the room of a
    document it is not allowed to read. Prefixed so a room can never be confused
    with an id from somewhere else.
    """
    return f"folium-doc-{document_id}"


def _mint(doc_id: str) -> dict[str, str]:
    """Ask y-sweet for a client token, creating the room if it is new.

    Split out as a module-level function so the tests can replace exactly this —
    the network boundary — and assert everything around it.

    Blocking: the SDK uses `requests`. Callers must not run it on the event loop.
    """
    from y_sweet_sdk import DocumentManager
    from y_sweet_sdk.error import YSweetError

    manager = DocumentManager(settings.y_sweet_connection_string)
    try:
        return manager.get_or_create_doc_and_token(doc_id)
    except YSweetError as exc:
        raise CollabUnavailableError(str(exc)) from exc


async def client_token(document_id: UUID) -> dict[str, str] | None:
    """A y-sweet client token for a document's room, or None if unconfigured.

    The caller must already have established that this user may see the
    document. None means collaboration is switched off, which is a normal state,
    not a failure.
    """
    if not settings.collaboration_enabled:
        return None

    # In a thread: the SDK is synchronous, and awaiting it directly would stall
    # every other request in the process for the duration of the round trip.
    return await asyncio.to_thread(_mint, room_id(document_id))
