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


def _mint(doc_id: str, authorization: str = "full") -> dict[str, str]:
    """Ask y-sweet for a client token, creating the room if it is new.

    Split out as a module-level function so the tests can replace exactly this —
    the network boundary — and assert everything around it.

    The SDK's own `get_client_token` posts an empty body, which always yields a
    writable token. y-sweet's auth endpoint accepts `authorization: "read-only"`,
    and a viewer must get one: enforcing read-only in the browser alone would
    leave the shared document writable by anyone who bypassed the UI. So the
    room is created with the SDK and the token requested directly, reusing the
    manager's parsed base URL and token rather than re-parsing the connection
    string here.

    Blocking: the SDK uses `requests`. Callers must not run it on the event loop.
    """
    import requests
    from y_sweet_sdk import DocumentManager
    from y_sweet_sdk.error import YSweetError

    manager = DocumentManager(settings.y_sweet_connection_string)
    try:
        manager.create_doc(doc_id)

        headers = {"Authorization": f"Bearer {manager.token}"} if manager.token else {}
        response = requests.post(
            f"{manager.base_url}/doc/{doc_id}/auth",
            headers=headers,
            json={"authorization": authorization},
            timeout=10,
        )
        response.raise_for_status()
        return response.json()
    except (YSweetError, requests.RequestException) as exc:
        raise CollabUnavailableError(str(exc)) from exc


async def client_token(document_id: UUID, *, can_write: bool) -> dict[str, str] | None:
    """A y-sweet client token for a document's room, or None if unconfigured.

    The caller must already have established that this user may see the
    document, and pass whether they may edit it. None means collaboration is
    switched off, which is a normal state, not a failure.
    """
    if not settings.collaboration_enabled:
        return None

    # A viewer gets a token the server itself refuses writes for, so read-only
    # does not depend on the browser behaving.
    authorization = "full" if can_write else "read-only"

    # In a thread: the SDK is synchronous, and awaiting it directly would stall
    # every other request in the process for the duration of the round trip.
    return await asyncio.to_thread(_mint, room_id(document_id), authorization)
