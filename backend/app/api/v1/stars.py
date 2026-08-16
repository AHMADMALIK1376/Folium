from uuid import UUID

from fastapi import APIRouter, Response, status

from app.api.deps import CurrentUser, DbSession
from app.schemas.document import DocumentSummary
from app.services import stars as service

router = APIRouter(prefix="/documents", tags=["documents"])


@router.get("/starred", response_model=list[DocumentSummary])
async def list_starred(db: DbSession, user: CurrentUser) -> list[DocumentSummary]:
    """This person's starred documents, most recently starred first."""
    rows = await service.list_starred(db, user.id)

    return [DocumentSummary.model_validate(row) for row in rows]


@router.put("/{document_id}/star", status_code=status.HTTP_204_NO_CONTENT)
async def add_star(document_id: UUID, db: DbSession, user: CurrentUser) -> Response:
    """Star a document. Follows *view*: a star is a private bookmark, not a
    change to the document, so anyone who can read it may keep one.

    PUT rather than POST because it is idempotent — starring twice leaves one
    star, which is what the composite primary key guarantees.
    """
    await service.star(db, document_id, user.id)

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/{document_id}/star", status_code=status.HTTP_204_NO_CONTENT)
async def remove_star(document_id: UUID, db: DbSession, user: CurrentUser) -> Response:
    await service.unstar(db, document_id, user.id)

    return Response(status_code=status.HTTP_204_NO_CONTENT)
