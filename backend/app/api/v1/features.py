from fastapi import APIRouter

from app.api.deps import CurrentUser
from app.config import settings
from app.schemas.publish import Features

router = APIRouter(tags=["features"])


@router.get("/features", response_model=Features)
async def features(user: CurrentUser) -> Features:
    """Which optional features this deployment has switched on.

    Booleans only, by construction: the response model has no field a secret
    could occupy. Signed-in users only, so an anonymous visitor cannot map which
    services a deployment runs.
    """
    return Features(
        collaboration=settings.collaboration_enabled,
        attachments=settings.attachments_enabled,
        github_publish=settings.github_publish_enabled,
    )
