import logging
import uuid

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.router import api_router
from app.config import settings
from app.core.exceptions import (
    ConflictError,
    NotFoundError,
    PermissionDeniedError,
    ValidationError,
)

logger = logging.getLogger(__name__)

app = FastAPI(title="Folium API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(NotFoundError)
async def handle_not_found(request: Request, exc: NotFoundError) -> JSONResponse:
    return JSONResponse(status_code=404, content={"detail": str(exc) or "Not found"})


@app.exception_handler(PermissionDeniedError)
async def handle_permission_denied(
    request: Request, exc: PermissionDeniedError
) -> JSONResponse:
    return JSONResponse(status_code=403, content={"detail": str(exc) or "Forbidden"})


@app.exception_handler(ValidationError)
async def handle_validation(request: Request, exc: ValidationError) -> JSONResponse:
    return JSONResponse(status_code=422, content={"detail": str(exc) or "Invalid request"})


@app.exception_handler(ConflictError)
async def handle_conflict(request: Request, exc: ConflictError) -> JSONResponse:
    return JSONResponse(status_code=409, content={"detail": str(exc) or "Conflict"})


@app.exception_handler(Exception)
async def handle_unexpected(request: Request, exc: Exception) -> JSONResponse:
    """Catch-all for anything not already mapped to a domain exception.

    Never leaks exception detail or a traceback to the client — only a
    correlation id, which is logged server-side alongside the full
    exception and traceback for debugging.
    """
    correlation_id = str(uuid.uuid4())
    logger.exception("Unhandled exception (correlation_id=%s)", correlation_id)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "correlation_id": correlation_id},
    )


app.include_router(api_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
