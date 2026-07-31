from uuid import UUID

from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.schemas.document import DocumentOut
from app.schemas.user import UserOut
from app.schemas.version import VersionDetail, VersionSummary
from app.services import documents as documents_service
from app.services import versions as service

router = APIRouter(prefix="/documents/{document_id}/versions", tags=["versions"])


@router.get("", response_model=list[VersionSummary])
async def list_versions(
    document_id: UUID, db: DbSession, user: CurrentUser
) -> list[VersionSummary]:
    """A document's history, newest first.

    Without content: fifty entries would otherwise mean fifty full documents.
    """
    rows = await service.list_versions(db, document_id, user.id)
    return [
        VersionSummary(
            id=version.id,
            created_at=version.created_at,
            created_by=version.created_by,
            author_name=author_name,
        )
        for version, author_name in rows
    ]


@router.get("/{version_id}", response_model=VersionDetail)
async def read_version(
    document_id: UUID, version_id: UUID, db: DbSession, user: CurrentUser
) -> VersionDetail:
    version, author_name = await service.get_version(db, document_id, version_id, user.id)
    return VersionDetail(
        id=version.id,
        created_at=version.created_at,
        created_by=version.created_by,
        author_name=author_name,
        content=version.content,
    )


@router.post("/{version_id}/restore", response_model=DocumentOut)
async def restore_version(
    document_id: UUID, version_id: UUID, db: DbSession, user: CurrentUser
) -> DocumentOut:
    document = await service.restore_version(db, document_id, version_id, user.id)
    owner = await documents_service.load_owner(db, document.owner_id)
    _, permission = await documents_service.get_document(db, document_id, user.id)

    return DocumentOut(
        id=document.id,
        title=document.title,
        owner_id=document.owner_id,
        created_at=document.created_at,
        updated_at=document.updated_at,
        content=document.content,
        permission=permission.value,
        owner=UserOut.model_validate(owner),
    )
