from uuid import UUID

from fastapi import APIRouter, Response, status

from app.api.deps import CurrentUser, DbSession
from app.schemas.document import (
    DocumentCreate,
    DocumentListOut,
    DocumentOut,
    DocumentSummary,
    DocumentUpdate,
)
from app.schemas.user import UserOut
from app.services import documents as service

router = APIRouter(prefix="/documents", tags=["documents"])


async def _to_out(db: DbSession, document, permission: str) -> DocumentOut:
    owner = await service.load_owner(db, document.owner_id)
    return DocumentOut(
        id=document.id,
        title=document.title,
        owner_id=document.owner_id,
        created_at=document.created_at,
        updated_at=document.updated_at,
        content=document.content,
        permission=permission,
        owner=UserOut.model_validate(owner),
    )


@router.get("", response_model=DocumentListOut)
async def list_documents(db: DbSession, user: CurrentUser) -> DocumentListOut:
    owned, shared = await service.list_documents(db, user.id)
    return DocumentListOut(
        owned=[DocumentSummary.model_validate(d) for d in owned],
        shared=[DocumentSummary.model_validate(d) for d in shared],
    )


@router.post("", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
async def create_document(
    data: DocumentCreate, db: DbSession, user: CurrentUser
) -> DocumentOut:
    document = await service.create_document(db, user.id, data)
    return await _to_out(db, document, "owner")


@router.get("/{document_id}", response_model=DocumentOut)
async def read_document(
    document_id: UUID, db: DbSession, user: CurrentUser
) -> DocumentOut:
    document, permission = await service.get_document(db, document_id, user.id)
    return await _to_out(db, document, permission.value)


@router.patch("/{document_id}", response_model=DocumentOut)
async def update_document(
    document_id: UUID, data: DocumentUpdate, db: DbSession, user: CurrentUser
) -> DocumentOut:
    document, permission = await service.update_document(db, document_id, user.id, data)
    return await _to_out(db, document, permission.value)


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: UUID, db: DbSession, user: CurrentUser
) -> Response:
    await service.soft_delete_document(db, document_id, user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{document_id}/restore", response_model=DocumentOut)
async def restore_document(
    document_id: UUID, db: DbSession, user: CurrentUser
) -> DocumentOut:
    document = await service.restore_document(db, document_id, user.id)
    return await _to_out(db, document, "owner")
