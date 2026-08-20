from fastapi import APIRouter

from app.api.v1 import (
    attachments,
    collab,
    comments,
    documents,
    export,
    folders,
    notifications,
    search,
    shares,
    stars,
    uploads,
    users,
    versions,
)

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(users.router)
api_router.include_router(folders.router)
api_router.include_router(notifications.router)
api_router.include_router(uploads.router)
# Before documents.router, and that ordering matters: /documents/{document_id}
# would otherwise capture /documents/search and reject it as a bad UUID.
api_router.include_router(search.router)
# Also before documents.router: /documents/starred would otherwise be read
# as /documents/{document_id} and rejected as a bad UUID.
api_router.include_router(stars.router)
api_router.include_router(documents.router)
api_router.include_router(shares.router)
api_router.include_router(versions.router)
api_router.include_router(collab.router)
api_router.include_router(export.router)
api_router.include_router(attachments.router)
api_router.include_router(comments.router)
