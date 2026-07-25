from fastapi import APIRouter

from app.api.v1 import documents, shares, uploads, users

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(users.router)
api_router.include_router(uploads.router)
api_router.include_router(documents.router)
api_router.include_router(shares.router)
