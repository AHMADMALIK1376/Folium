from uuid import UUID

from fastapi import APIRouter, Response, status

from app.api.deps import CurrentUser, DbSession
from app.schemas.share import ShareCreate, ShareOut, ShareUpdate
from app.services import sharing as service

router = APIRouter(prefix="/documents/{document_id}/shares", tags=["shares"])


@router.get("", response_model=list[ShareOut])
async def list_shares(
    document_id: UUID, db: DbSession, user: CurrentUser
) -> list[ShareOut]:
    rows = await service.list_shares(db, document_id, user.id)
    return [
        ShareOut(
            user_id=target.id,
            email=target.email,
            display_name=target.display_name,
            permission=permission,
            created_at=created_at,
        )
        for target, permission, created_at in rows
    ]


@router.post("", response_model=ShareOut, status_code=status.HTTP_201_CREATED)
async def create_share(
    document_id: UUID, data: ShareCreate, db: DbSession, user: CurrentUser
) -> ShareOut:
    target, share = await service.share_document(db, document_id, user.id, data)
    return ShareOut(
        user_id=target.id,
        email=target.email,
        display_name=target.display_name,
        permission=share.permission,
        created_at=share.created_at,
    )


@router.patch("/{target_user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def update_share(
    document_id: UUID,
    target_user_id: UUID,
    data: ShareUpdate,
    db: DbSession,
    user: CurrentUser,
) -> Response:
    await service.update_share(db, document_id, user.id, target_user_id, data.permission)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/{target_user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_share(
    document_id: UUID, target_user_id: UUID, db: DbSession, user: CurrentUser
) -> Response:
    await service.unshare_document(db, document_id, user.id, target_user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
