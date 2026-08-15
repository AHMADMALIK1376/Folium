from fastapi import APIRouter

from app.api.v1 import collab, documents, export, shares, uploads, users, versions

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(users.router)
api_router.include_router(uploads.router)
api_router.include_router(documents.router)
api_router.include_router(shares.router)
api_router.include_router(versions.router)
api_router.include_router(collab.router)
api_router.include_router(export.router)
