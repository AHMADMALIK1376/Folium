from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends

from app.api.deps import CurrentUser, DbSession
from app.api.v1.export import safe_filename
from app.config import settings
from app.schemas.publish import (
    PublicationOut,
    Publisher,
    PublishOut,
    PublishRequest,
    PublishStatus,
)
from app.services import documents as documents_service
from app.services import publishing as service
from app.services.permissions import can_edit

router = APIRouter(prefix="/documents/{document_id}", tags=["publishing"])

# Where a first publish suggests putting a file. The person can change it.
SUGGESTED_FOLDER = "docs"


def get_github_client() -> service.GitHubClient:
    """A dependency, so tests can hand the route a client wired to a fake GitHub."""
    return service.make_github_client()


def _publisher(user) -> Publisher:
    return Publisher(id=user.id, display_name=user.display_name)


@router.get("/publish", response_model=PublishStatus)
async def publish_status(document_id: UUID, db: DbSession, user: CurrentUser) -> PublishStatus:
    """Where this document publishes to and when it last did.

    Follows *view*: knowing that a document was published, and where, is no more
    than someone who can read it can learn from the repository itself.
    """
    document, permission = await documents_service.get_document(db, document_id, user.id)
    configured = settings.github_publish_enabled
    publisher = await service.publisher_of(db, document)

    path = document.github_path or f"{SUGGESTED_FOLDER}/{safe_filename(document.title)}"
    published = document.last_published_at is not None

    return PublishStatus(
        configured=configured,
        can_publish=configured and can_edit(permission),
        repo=settings.github_repo if configured else None,
        branch=settings.github_branch if configured else None,
        path=path,
        is_published=published,
        last_published_at=document.last_published_at,
        last_published_by=_publisher(publisher) if publisher else None,
        file_url=(
            service.file_url(service.full_path(document.github_path))
            if configured and published and document.github_path
            else None
        ),
    )


@router.post("/publish", response_model=PublishOut)
async def publish(
    document_id: UUID,
    body: PublishRequest,
    db: DbSession,
    user: CurrentUser,
    github: Annotated[service.GitHubClient, Depends(get_github_client)],
) -> PublishOut:
    """Commit the document to the configured repository as Markdown."""
    result = await service.publish_document(
        db, github, document_id, user, body.path, body.overwrite
    )

    return PublishOut(
        path=result.path,
        commit_sha=result.commit_sha,
        commit_url=service.commit_url(result.commit_sha),
        file_url=service.file_url(service.full_path(result.path)),
        blob_sha=result.blob_sha,
        published_at=result.published_at,
        published_by=_publisher(result.published_by),
    )


@router.get("/publications", response_model=list[PublicationOut])
async def publications(document_id: UUID, db: DbSession, user: CurrentUser) -> list[PublicationOut]:
    rows = await service.list_publications(db, document_id, user.id)

    return [
        PublicationOut(
            id=p.id,
            path=p.path,
            commit_sha=p.commit_sha,
            commit_url=service.commit_url(p.commit_sha),
            published_at=p.published_at,
            published_by=_publisher(u) if u else None,
        )
        for p, u in rows
    ]
