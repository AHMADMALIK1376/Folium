from uuid import UUID

from fastapi import APIRouter, Response, status

from app.api.deps import CurrentUser, DbSession
from app.schemas.folder import FolderCreate, FolderOut, FolderUpdate
from app.services import folders as service

router = APIRouter(prefix="/folders", tags=["folders"])


def _out(folder, count: int) -> FolderOut:
    return FolderOut(
        id=folder.id, name=folder.name, created_at=folder.created_at, document_count=count
    )


@router.get("", response_model=list[FolderOut])
async def list_folders(db: DbSession, user: CurrentUser) -> list[FolderOut]:
    return [_out(folder, count) for folder, count in await service.list_folders(db, user.id)]


@router.post("", response_model=FolderOut, status_code=status.HTTP_201_CREATED)
async def create_folder(data: FolderCreate, db: DbSession, user: CurrentUser) -> FolderOut:
    folder = await service.create_folder(db, user.id, data.name)

    return _out(folder, 0)


@router.patch("/{folder_id}", response_model=FolderOut)
async def rename_folder(
    folder_id: UUID, data: FolderUpdate, db: DbSession, user: CurrentUser
) -> FolderOut:
    folder = await service.rename_folder(db, folder_id, user.id, data.name)

    # Re-read the count rather than assuming: a rename does not change it, but
    # returning a made-up zero would be a lie the client would render.
    counts = {f.id: c for f, c in await service.list_folders(db, user.id)}

    return _out(folder, counts.get(folder.id, 0))


@router.delete("/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_folder(folder_id: UUID, db: DbSession, user: CurrentUser) -> Response:
    """Delete the folder. Its documents survive, unfiled.

    Cascading into them would make reorganising destructive, and there is
    already a trash for deleting.
    """
    await service.delete_folder(db, folder_id, user.id)

    return Response(status_code=status.HTTP_204_NO_CONTENT)
