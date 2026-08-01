from uuid import UUID

from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.schemas.collab import CollabSession, CollabUser
from app.services import collab as service
from app.services import documents as documents_service
from app.services.permissions import can_edit

router = APIRouter(prefix="/documents/{document_id}/collab", tags=["collaboration"])


@router.post("", response_model=CollabSession)
async def start_collab_session(
    document_id: UUID, db: DbSession, user: CurrentUser
) -> CollabSession:
    """Authorise this user for the document's collaboration room.

    Access is checked first and the token minted second, deliberately. Reversing
    them would hand out a working room token for a document the caller may not
    read — the 404 would arrive too late to matter.
    """
    _, permission = await documents_service.get_document(db, document_id, user.id)

    # The caller, already authenticated to decide whether to mint at all — so
    # the editor needs no second request to learn who it is labelling.
    caller = CollabUser(id=user.id, email=user.email, display_name=user.display_name)

    session = await service.client_token(document_id, can_write=can_edit(permission))
    if session is None:
        return CollabSession(enabled=False, permission=permission.value, user=caller)

    return CollabSession(
        enabled=True,
        url=session["url"],
        base_url=session.get("baseUrl"),
        doc_id=session["docId"],
        token=session.get("token"),
        permission=permission.value,
        user=caller,
    )
